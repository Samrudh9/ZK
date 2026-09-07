#!/usr/bin/env bash
# ZKHealthPass — Phase 3: deploy accessControl chaincode using CCaaS external builder
#
# This uses "Chaincode as a Service" (CCaaS) mode to avoid Docker-in-Docker
# image builds which are broken with Docker Engine 29.x + Fabric 2.5.4.
#
# The chaincode runs in its own container that connects to the peer.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANNEL="healthchannel"
CHAINCODE_NAME="accessControl"
CHAINCODE_VERSION="1.0"
CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
CHAINCODE_SEQUENCE=1
ORDERER_ADDR="orderer0.example.com:7050"
ORDERER_TLS_CA="/opt/fabric-network/crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

ORG1_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
ORG2_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
ORG1_CA="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem"
ORG2_CA="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem"

# CCaaS chaincode server address (accessible from the peer containers)
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

# ── Step 1: Build CCaaS package ──────────────────────────────────────
echo "==> [1/9] building CCaaS chaincode package"

# Chaincode source (for META-INF CouchDB indexes bundled into the package)
CHAINCODE_SRC="${NETWORK_DIR}/../chaincode/accessControl"

CCAAS_PKGDIR="${NETWORK_DIR}/channel-artifacts/ccaas-pkg"
rm -rf "${CCAAS_PKGDIR}"
mkdir -p "${CCAAS_PKGDIR}"

# connection.json tells the peer where to find the running chaincode server
cat > "${CCAAS_PKGDIR}/connection.json" <<EOF
{
  "address": "${CC_SERVER_HOSTNAME}:${CC_SERVER_PORT}",
  "dial_timeout": "10s",
  "tls_required": false
}
EOF

# metadata.json describes the chaincode type and label
cat > "${CCAAS_PKGDIR}/metadata.json" <<EOF
{
  "type": "ccaas",
  "label": "${CHAINCODE_LABEL}"
}
EOF

# Create the .tar.gz package (code.tar.gz inside the outer tar.gz)
pushd "${CCAAS_PKGDIR}" > /dev/null
tar czf code.tar.gz connection.json
tar czf "${NETWORK_DIR}/channel-artifacts/${CHAINCODE_LABEL}.tar.gz" \
  code.tar.gz metadata.json \
  -C "${CHAINCODE_SRC}" META-INF 2>/dev/null || \
  tar czf "${NETWORK_DIR}/channel-artifacts/${CHAINCODE_LABEL}.tar.gz" code.tar.gz metadata.json
popd > /dev/null
rm -rf "${CCAAS_PKGDIR}"

echo "    Package created: channel-artifacts/${CHAINCODE_LABEL}.tar.gz"

# Copy the package into the cli container
PACKAGE_FILE="/opt/fabric-network/channel-artifacts/${CHAINCODE_LABEL}.tar.gz"

# ── Step 2-3: Install on all peers ──────────────────────────────────
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

# ── Step 4: Get package ID ──────────────────────────────────────────
echo "==> [4/9] fetching package ID (from peer0.org1)"
PKG_ID=$(
  run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
    peer lifecycle chaincode queryinstalled | \
    grep -o "Package ID: [^,]*" | awk -F': ' '{print $2}' | grep "${CHAINCODE_LABEL}"
)
[ -n "${PKG_ID}" ] || { echo "ERROR: could not determine package ID"; exit 1; }
echo "    package ID: ${PKG_ID}"

# ── Step 5: Build and start the chaincode container ─────────────────
echo "==> [5/9] building and starting chaincode container"

# Build a Docker image for the chaincode
CC_IMAGE="zkhealth/accesscontrol-cc:${CHAINCODE_VERSION}"

docker build -t "${CC_IMAGE}" -f - "${CHAINCODE_SRC}" <<'DOCKERFILE'
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

# Remove old chaincode container if exists
docker rm -f "${CC_SERVER_HOSTNAME}" 2>/dev/null || true

# Get the Docker network name
NETWORK_NAME=$(docker inspect peer0.org1.example.com --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

# Start chaincode container with proper args
# Need full path to fabric-chaincode-node since PATH may not be set in sh
docker run -d \
  --name "${CC_SERVER_HOSTNAME}" \
  --network "${NETWORK_NAME}" \
  "${CC_IMAGE}" \
  sh -c "npm start -- --chaincode-address=0.0.0.0:9999 --chaincode-id=${PKG_ID}"

echo "Waiting 5s for chaincode to start..."
sleep 5

# Verify connectivity
if docker logs "${CC_SERVER_HOSTNAME}" 2>&1 | grep -q "Started chaincode server"; then
  echo "Chaincode container started successfully at ${CC_SERVER_HOSTNAME}:9999"
else
  echo "ERROR: Chaincode container failed to start - check logs with 'docker logs ${CC_SERVER_HOSTNAME}'"
  exit 1
fi

echo "    Chaincode container started: ${CC_SERVER_HOSTNAME}"
sleep 3

# ── Step 6-7: Approve for both orgs ────────────────────────────────
echo "==> [6/9] approving for Org1"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --package-id "${PKG_ID}" --sequence "${CHAINCODE_SEQUENCE}" \
  --tls --cafile "${ORDERER_TLS_CA}"

echo "==> [7/9] approving for Org2"
run_cli Org2MSP "${ORG2_ADMIN_MSP}" peer0.org2.example.com:7051 "${ORG2_CA}" \
  peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --package-id "${PKG_ID}" --sequence "${CHAINCODE_SEQUENCE}" \
  --tls --cafile "${ORDERER_TLS_CA}"

# ── Step 8: Check commit readiness ─────────────────────────────────
echo "==> [8/9] commit readiness"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode checkcommitreadiness \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --sequence "${CHAINCODE_SEQUENCE}" --output json

# ── Step 9: Commit to channel ──────────────────────────────────────
echo "==> [9/9] committing to channel"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode commit \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --sequence "${CHAINCODE_SEQUENCE}" \
  --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles "${ORG1_CA}" \
  --peerAddresses peer0.org2.example.com:7051 --tlsRootCertFiles "${ORG2_CA}" \
  --tls --cafile "${ORDERER_TLS_CA}"

echo ""
echo "Chaincode ${CHAINCODE_LABEL} committed on ${CHANNEL} (CCaaS mode)."
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode querycommitted --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}"