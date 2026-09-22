#!/usr/bin/env bash
# ZKHealthPass — chaincode upgrade (CCaaS) helper
#
# Bumps the accessControl chaincode to ${CHAINCODE_VERSION} (sequence
# ${CHAINCODE_SEQUENCE}). Edit CHAINCODE_VERSION / CHAINCODE_SEQUENCE for the
# next upgrade; the script (re)packages, rebuilds the image, (re)installs on all
# peers, approves for both orgs, and commits.
#
# v1.1 (seq 3): added GetAuditEvent.
# v1.2 (seq 4): deterministic tx timestamps (ctx.stub.getTxTimestamp) to fix
#   endorsement mismatches ("ProposalResponsePayloads do not match").
#
# Prereq: the Fabric network (peers/orderers/CouchDB/cli) is already running via
# `docker compose up -d` in fabric-network/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANNEL="healthchannel"
CHAINCODE_NAME="accessControl"
CHAINCODE_VERSION="1.2"
CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
CHAINCODE_SEQUENCE=4
ORDERER_ADDR="orderer0.example.com:7050"
ORDERER_TLS_CA="/opt/fabric-network/crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

ORG1_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
ORG2_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
ORG1_CA="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem"
ORG2_CA="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem"

CC_SERVER_HOSTNAME="ccaas.accesscontrol"
CC_SERVER_PORT=9999

run_cli() { # $1 = MSPID, $2 = admin MSP path, $3 = peer address, $4 = peer TLS CA
  docker exec \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID="$1" \
    -e CORE_PEER_MSPCONFIGPATH="$2" \
    -e CORE_PEER_ADDRESS="$3" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="$4" \
    -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
    cli "${@:5}"
}

echo "==> [1/9] building CCaaS chaincode package"

CHAINCODE_SRC="${NETWORK_DIR}/../chaincode/accessControl"
CCAAS_PKGDIR="${NETWORK_DIR}/channel-artifacts/ccaas-pkg"
rm -rf "${CCAAS_PKGDIR}"
mkdir -p "${CCAAS_PKGDIR}"

cat > "${CCAAS_PKGDIR}/connection.json" <<EOF
{
  "address": "${CC_SERVER_HOSTNAME}:${CC_SERVER_PORT}",
  "dial_timeout": "10s",
  "tls_required": false
}
EOF

cat > "${CCAAS_PKGDIR}/metadata.json" <<EOF
{
  "type": "ccaas",
  "label": "${CHAINCODE_LABEL}"
}
EOF

pushd "${CCAAS_PKGDIR}" > /dev/null
tar czf code.tar.gz connection.json
# NOTE: META-INF CouchDB indexes are intentionally excluded from the package:
# Fabric's install parser rejects tar directory entries (type 53). The indexes
# already exist on the CouchDB instances (created manually), so they persist.
tar czf "${NETWORK_DIR}/channel-artifacts/${CHAINCODE_LABEL}.tar.gz" \
  code.tar.gz metadata.json
popd > /dev/null
rm -rf "${CCAAS_PKGDIR}"
echo "    Package created: channel-artifacts/${CHAINCODE_LABEL}.tar.gz"

PACKAGE_FILE="/opt/fabric-network/channel-artifacts/${CHAINCODE_LABEL}.tar.gz"

echo "==> [2/9] installing on Org1 peers"
for peer in peer0.org1.example.com:7051 peer1.org1.example.com:7051; do
  run_cli Org1MSP "${ORG1_ADMIN_MSP}" "${peer}" "${ORG1_CA}" \
    peer lifecycle chaincode install "${PACKAGE_FILE}"
done

echo "==> [3/9] installing on Org2 peers"
for peer in peer0.org2.example.com:7051 peer1.org2.example.com:7051; do
  run_cli Org2MSP "${ORG2_ADMIN_MSP}" "${peer}" "${ORG2_CA}" \
    peer lifecycle chaincode install "${PACKAGE_FILE}"
done

echo "==> [4/9] fetching package ID (from peer0.org1)"
# A re-run produces a different code-package hash (tar timestamps), so multiple
# matching package IDs can be installed. The lifecycle-approved one must be the
# package present on ALL peers, i.e. the last-installed match for this label.
PKG_ID=$(
  run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
    peer lifecycle chaincode queryinstalled | \
    grep -o "Package ID: [^,]*" | awk -F': ' '{print $2}' | grep "${CHAINCODE_LABEL}" | tail -n 1
)
[ -n "${PKG_ID}" ] || { echo "ERROR: could not determine package ID"; exit 1; }
echo "    package ID: ${PKG_ID}"

echo "==> [5/9] building and starting chaincode container"
CC_IMAGE="zkhealth/accesscontrol-cc:${CHAINCODE_VERSION}"

docker build -t "${CC_IMAGE}" -f - "${CHAINCODE_SRC}" <<DOCKERFILE
FROM node:18-alpine
WORKDIR /chaincode
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
ENV CORE_CHAINCODE_ID_NAME=""
ENV CORE_CHAINCODE_ADDRESS="0.0.0.0:9999"
EXPOSE 9999
CMD ["npm", "start"]
DOCKERFILE

docker rm -f "${CC_SERVER_HOSTNAME}" 2>/dev/null || true
NETWORK_NAME=$(docker inspect peer0.org1.example.com --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

docker run -d \
  --name "${CC_SERVER_HOSTNAME}" \
  --network "${NETWORK_NAME}" \
  "${CC_IMAGE}" \
  sh -c "npm start -- --chaincode-address=0.0.0.0:9999 --chaincode-id=${PKG_ID}"

echo "Waiting 8s for chaincode to start..."
sleep 8

if docker logs "${CC_SERVER_HOSTNAME}" 2>&1 | grep -q "Bootstrap process completed"; then
  echo "Chaincode container started successfully at ${CC_SERVER_HOSTNAME}:9999"
else
  echo "ERROR: chaincode container failed to start - check 'docker logs ${CC_SERVER_HOSTNAME}'"
  exit 1
fi
sleep 3

echo "==> [6/9] approving for Org1 (sequence 3)"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --package-id "${PKG_ID}" --sequence "${CHAINCODE_SEQUENCE}" \
  --tls --cafile "${ORDERER_TLS_CA}"

echo "==> [7/9] approving for Org2 (sequence 3)"
run_cli Org2MSP "${ORG2_ADMIN_MSP}" peer0.org2.example.com:7051 "${ORG2_CA}" \
  peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --package-id "${PKG_ID}" --sequence "${CHAINCODE_SEQUENCE}" \
  --tls --cafile "${ORDERER_TLS_CA}"

echo "==> [8/9] commit readiness"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode checkcommitreadiness \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --sequence "${CHAINCODE_SEQUENCE}" --output json

echo "==> [9/9] committing to channel (sequence 3)"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode commit \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --sequence "${CHAINCODE_SEQUENCE}" \
  --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles "${ORG1_CA}" \
  --peerAddresses peer0.org2.example.com:7051 --tlsRootCertFiles "${ORG2_CA}" \
  --tls --cafile "${ORDERER_TLS_CA}"

echo ""
echo "Chaincode ${CHAINCODE_LABEL} committed on ${CHANNEL} (CCaaS mode, sequence ${CHAINCODE_SEQUENCE})."
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode querycommitted --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}"