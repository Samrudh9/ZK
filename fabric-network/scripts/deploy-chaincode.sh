#!/usr/bin/env bash
# ZKHealthPass — Phase 3: package, install, approve, and commit accessControl chaincode
#
# Requires: setup-network.sh + create-channel.sh ran, and the chaincode has been
# built (cd ../chaincode/accessControl && npm install).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANNEL="healthchannel"
CHAINCODE_NAME="accessControl"
CHAINCODE_VERSION="1.0"
CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
CHAINCODE_PATH="/opt/chaincode/accessControl"   # mounted into cli container
PACKAGE_FILE="/opt/fabric-network/channel-artifacts/${CHAINCODE_LABEL}.tar.gz"
ORDERER_ADDR="orderer0.example.com:7050"
ORDERER_TLS_CA="/opt/fabric-network/crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

ORG1_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
ORG2_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
ORG1_CA="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/ca/ca.org1.example.com-cert.pem"
ORG2_CA="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/ca/ca.org2.example.com-cert.pem"

run_cli() { # $1 = MSPID, $2 = admin MSP path, $3 = peer address, $4 = peer TLS CA
  docker exec \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID="$1" \
    -e CORE_PEER_MSPCONFIGPATH="$2" \
    -e CORE_PEER_ADDRESS="$3" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="$4" \
    -e FABRIC_CFG_PATH=/etc/hyperledger/peer \
    cli "${@:5}"
}

echo "==> [1/8] packaging chaincode"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode package "${PACKAGE_FILE}" \
  --path "${CHAINCODE_PATH}" --lang node --label "${CHAINCODE_LABEL}"

echo "==> [2/8] installing on Org1 peers"
for peer in peer0.org1.example.com:7051 peer1.org1.example.com:7051; do
  run_cli Org1MSP "${ORG1_ADMIN_MSP}" "${peer}" "${ORG1_CA}" \
    peer lifecycle chaincode install "${PACKAGE_FILE}"
done

echo "==> [3/8] installing on Org2 peers"
for peer in peer0.org2.example.com:7051 peer1.org2.example.com:7051; do
  run_cli Org2MSP "${ORG2_ADMIN_MSP}" "${peer}" "${ORG2_CA}" \
    peer lifecycle chaincode install "${PACKAGE_FILE}"
done

echo "==> [4/8] fetching package ID (from peer0.org1)"
PKG_ID=$(
  run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
    peer lifecycle chaincode queryinstalled | \
    grep -o "Package ID: [^,]*" | awk -F': ' '{print $2}' | grep "${CHAINCODE_LABEL}"
)
[ -n "${PKG_ID}" ] || { echo "ERROR: could not determine package ID"; exit 1; }
echo "    package ID: ${PKG_ID}"

echo "==> [5/8] approving for Org1"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --package-id "${PKG_ID}" --sequence 1 \
  --tls --cafile "${ORDERER_TLS_CA}"

echo "==> [6/8] approving for Org2"
run_cli Org2MSP "${ORG2_ADMIN_MSP}" peer0.org2.example.com:7051 "${ORG2_CA}" \
  peer lifecycle chaincode approveformyorg \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --package-id "${PKG_ID}" --sequence 1 \
  --tls --cafile "${ORDERER_TLS_CA}"

echo "==> [7/8] commit readiness"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode checkcommitreadiness \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --sequence 1 --output json

echo "==> [8/8] committing to channel"
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode commit \
  -o "${ORDERER_ADDR}" --ordererTLSHostnameOverride orderer0.example.com \
  --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}" --version "${CHAINCODE_VERSION}" \
  --sequence 1 \
  --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles "${ORG1_CA}" \
  --peerAddresses peer0.org2.example.com:7051 --tlsRootCertFiles "${ORG2_CA}" \
  --tls --cafile "${ORDERER_TLS_CA}"

echo ""
echo "Chaincode ${CHAINCODE_LABEL} committed on ${CHANNEL}."
run_cli Org1MSP "${ORG1_ADMIN_MSP}" peer0.org1.example.com:7051 "${ORG1_CA}" \
  peer lifecycle chaincode querycommitted --channelID "${CHANNEL}" --name "${CHAINCODE_NAME}"