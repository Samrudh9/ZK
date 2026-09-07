#!/usr/bin/env bash
# ZKHealthPass — Phase 1: create healthchannel, join all peers, set anchor peers
#
# Requires: setup-network.sh already ran (containers up, artifacts generated).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANNEL="healthchannel"
ORDERER_ADDR="orderer0.example.com:7050"
ORDERER_TLS_CA="/opt/fabric-network/crypto-config/ordererOrganizations/example.com/orderers/orderer0.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
ARTIFACTS="/opt/fabric-network/channel-artifacts"

# Paths inside the cli container
ORG1_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
ORG2_ADMIN_MSP="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
ORG1_CA="/opt/fabric-network/crypto-config/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem"
ORG2_CA="/opt/fabric-network/crypto-config/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem"

docker exec cli peer version >/dev/null 2>&1 || {
  echo "ERROR: cli container not running. Did setup-network.sh finish?"; exit 1
}

# ── 1. Create channel (as Org1 admin, via peer0.org1) ───────────────
echo "==> [1/6] creating channel '${CHANNEL}'"
docker exec \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH="${ORG1_ADMIN_MSP}" \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG1_CA}" \
  -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
  cli peer channel create \
    -o "${ORDERER_ADDR}" \
    --ordererTLSHostnameOverride orderer0.example.com \
    -c "${CHANNEL}" \
    -f "${ARTIFACTS}/healthchannel.tx" \
    --outputBlock "${ARTIFACTS}/healthchannel.block" \
    --tls --cafile "${ORDERER_TLS_CA}"

# ── 2. Join Org1 peers ──────────────────────────────────────────────
for peer in peer0.org1.example.com:7051 peer1.org1.example.com:7051; do
  echo "==> [2/6] joining ${peer}"
  docker exec \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID=Org1MSP \
    -e CORE_PEER_MSPCONFIGPATH="${ORG1_ADMIN_MSP}" \
    -e CORE_PEER_ADDRESS="${peer}" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG1_CA}" \
    -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
    cli peer channel join -b "${ARTIFACTS}/healthchannel.block"
done

# ── 3. Join Org2 peers ──────────────────────────────────────────────
for peer in peer0.org2.example.com:7051 peer1.org2.example.com:7051; do
  echo "==> [3/6] joining ${peer}"
  docker exec \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID=Org2MSP \
    -e CORE_PEER_MSPCONFIGPATH="${ORG2_ADMIN_MSP}" \
    -e CORE_PEER_ADDRESS="${peer}" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG2_CA}" \
    -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
    cli peer channel join -b "${ARTIFACTS}/healthchannel.block"
done

# ── 4. Update anchor peers ──────────────────────────────────────────
echo "==> [4/6] updating Org1 anchor peer"
docker exec \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH="${ORG1_ADMIN_MSP}" \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG1_CA}" \
  -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
  cli peer channel update \
    -o "${ORDERER_ADDR}" \
    --ordererTLSHostnameOverride orderer0.example.com \
    -c "${CHANNEL}" \
    -f "${ARTIFACTS}/Org1MSPanchors.tx" \
    --tls --cafile "${ORDERER_TLS_CA}"

echo "==> [5/6] updating Org2 anchor peer"
docker exec \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_LOCALMSPID=Org2MSP \
  -e CORE_PEER_MSPCONFIGPATH="${ORG2_ADMIN_MSP}" \
  -e CORE_PEER_ADDRESS=peer0.org2.example.com:7051 \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG2_CA}" \
  -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
  cli peer channel update \
    -o "${ORDERER_ADDR}" \
    --ordererTLSHostnameOverride orderer0.example.com \
    -c "${CHANNEL}" \
    -f "${ARTIFACTS}/Org2MSPanchors.tx" \
    --tls --cafile "${ORDERER_TLS_CA}"

# ── 5. Verify ───────────────────────────────────────────────────────
echo "==> [6/6] verifying channel state (Org1)"
docker exec \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH="${ORG1_ADMIN_MSP}" \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG1_CA}" \
  -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
  cli peer channel list

docker exec \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH="${ORG1_ADMIN_MSP}" \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${ORG1_CA}" \
  -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
  cli peer channel getinfo -c "${CHANNEL}"

echo ""
echo "Channel '${CHANNEL}' created, 4 peers joined, anchor peers set."