#!/usr/bin/env bash
# ZKHealthPass — Phase 1: enroll admin identities via Fabric CA into wallets/
# These identities are used by the backend (@hyperledger/fabric-gateway).
#
# Requires: setup-network.sh already ran (CA containers up, crypto generated).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FABRIC_BIN="$(cd "${NETWORK_DIR}/../bin" && pwd)"

export PATH="${FABRIC_BIN}:${PATH}"
cd "${NETWORK_DIR}"

mkdir -p wallets

ORG1_CA_CERT="${NETWORK_DIR}/crypto-config/peerOrganizations/org1.example.com/ca/tls-cert.pem"
ORG2_CA_CERT="${NETWORK_DIR}/crypto-config/peerOrganizations/org2.example.com/ca/tls-cert.pem"

echo "==> Extracting TLS certs from CA containers"
docker cp ca.org1.example.com:/etc/hyperledger/fabric-ca-server/tls-cert.pem "${ORG1_CA_CERT}"
docker cp ca.org2.example.com:/etc/hyperledger/fabric-ca-server/tls-cert.pem "${ORG2_CA_CERT}"

[ -f "${ORG1_CA_CERT}" ] && [ -f "${ORG2_CA_CERT}" ] || {
  echo "ERROR: CA certs missing. Did setup-network.sh finish?"; exit 1
}

echo "==> enrolling Org1 admin (ca-org1 @ localhost:7054)"
fabric-ca-client enroll \
  -H "${NETWORK_DIR}" \
  -u https://admin:adminpw@localhost:7054 \
  --caname ca-org1 \
  --tls.certfiles "${ORG1_CA_CERT}" \
  --csr.hosts localhost \
  --mspdir "${NETWORK_DIR}/wallets/org1-admin/msp"

echo "==> enrolling Org2 admin (ca-org2 @ localhost:8054)"
fabric-ca-client enroll \
  -H "${NETWORK_DIR}" \
  -u https://admin:adminpw@localhost:8054 \
  --caname ca-org2 \
  --tls.certfiles "${ORG2_CA_CERT}" \
  --csr.hosts localhost \
  --mspdir "${NETWORK_DIR}/wallets/org2-admin/msp"

echo ""
echo "Admin identities enrolled:"
ls -1 "${NETWORK_DIR}"/wallets/*/msp/signcerts/
echo ""
echo "Point the backend at these when wiring fabric.service.js:"
echo "  FABRIC_CERT_PATH=../fabric-network/wallets/org1-admin/msp/signcerts/cert.pem"
echo "  FABRIC_KEY_PATH=../fabric-network/wallets/org1-admin/msp/keystore/<generated-file>"