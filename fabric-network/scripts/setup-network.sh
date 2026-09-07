#!/usr/bin/env bash
# ZKHealthPass — Phase 1: bootstrap the Fabric 2.5 network
# Generates org crypto (cryptogen), channel artifacts (configtxgen),
# starts peers/orderers/CAs/CouchDB (docker-compose).
#
# NOTE: run inside WSL2 Ubuntu with Docker installed:
#   cd fabric-network && ./scripts/setup-network.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FABRIC_BIN="$(cd "${NETWORK_DIR}/../bin" && pwd)"   # from the Fabric bootstrap script

export PATH="${FABRIC_BIN}:${PATH}"
export FABRIC_CFG_PATH="${NETWORK_DIR}"
cd "${NETWORK_DIR}"

# ── 1. Prerequisites ────────────────────────────────────────────────
for tool in cryptogen configtxgen docker jq; do
  command -v "${tool}" >/dev/null 2>&1 || {
    echo "ERROR: '${tool}' not found. Install Fabric binaries and Docker first (requirements.md)."
    exit 1
  }
done

mkdir -p channel-artifacts wallets

# ── 2. Generate org certificates ────────────────────────────────────
echo "==> [1/5] cryptogen: generating org certs"
rm -rf crypto-config
cryptogen generate --config=./crypto-config.yaml --output=./crypto-config

# ── 3. Generate channel artifacts ───────────────────────────────────
echo "==> [2/5] configtxgen: system-channel genesis block"
configtxgen -profile TwoOrgsOrdererGenesis -channelID system-channel \
  -outputBlock ./channel-artifacts/genesis.block

echo "==> [3/5] configtxgen: healthchannel creation tx"
configtxgen -profile TwoOrgsChannel -channelID healthchannel \
  -outputCreateChannelTx ./channel-artifacts/healthchannel.tx

echo "==> [3/5] configtxgen: anchor peer update txs"
configtxgen -profile TwoOrgsChannel -channelID healthchannel \
  -outputAnchorPeersUpdate ./channel-artifacts/Org1MSPanchors.tx -asOrg Org1MSP
configtxgen -profile TwoOrgsChannel -channelID healthchannel \
  -outputAnchorPeersUpdate ./channel-artifacts/Org2MSPanchors.tx -asOrg Org2MSP

# ── 4. Start the network ────────────────────────────────────────────
echo "==> [4/5] docker-compose: starting network"
docker-compose -f ./docker-compose.yaml up -d

# ── 5. Wait for peers ───────────────────────────────────────────────
echo "==> [5/5] waiting for containers to be healthy..."
sleep 8
docker ps --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo "Network is up."
echo "Next steps:"
echo "  ./scripts/create-channel.sh     # create + join healthchannel"
echo "  ./scripts/enroll-admin.sh       # enroll admin identities into wallets/"
echo "  ./scripts/deploy-chaincode.sh   # (Phase 3) install accessControl chaincode"
