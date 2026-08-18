#!/usr/bin/env bash
# ZKHealthPass — Phase 2: compile circuit, run Groth16 trusted setup,
# export verification key, copy artifacts into backend/src/circuits/
#
# Requires: circom (cargo install), snarkjs (npm i -g), wget/curl.
# NOTE: run inside WSL2 Ubuntu (or Linux). ~170MB ptau download on first run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_CIRCUITS="$(cd "${CIRCUITS_DIR}/../backend/src/circuits" && pwd)"

PTAU_SIZE=14
PTAU_FILE="powersOfTau28_hez_final_${PTAU_SIZE}.ptau"
PTAU_URL="https://hermez.s3-eu-west-1.amazonaws.com/${PTAU_FILE}"

cd "${CIRCUITS_DIR}"

# ── 1. Prerequisites ────────────────────────────────────────────────
for tool in circom snarkjs wget curl; do
  command -v "${tool}" >/dev/null 2>&1 || {
    echo "WARN: '${tool}' not found. Skipping check."
  }
done
command -v circom >/dev/null 2>&1 || { echo "ERROR: circom not found (cargo install circom)"; exit 1; }
command -v snarkjs >/dev/null 2>&1 || { echo "ERROR: snarkjs not found (npm install -g snarkjs)"; exit 1; }

# ── 2. circomlib dependency ─────────────────────────────────────────
[ -d node_modules/circomlib ] || npm install circomlib@2.0.5

# ── 3. Compile ──────────────────────────────────────────────────────
echo "==> [1/5] compiling access_control.circom"
circom access_control.circom --r1cs --wasm --sym -l node_modules

# ── 4. Powers of Tau (download once) ────────────────────────────────
echo "==> [2/5] downloading ${PTAU_FILE}"
if [ ! -f "${PTAU_FILE}" ]; then
  wget "${PTAU_URL}" -O "${PTAU_FILE}" || curl -L "${PTAU_URL}" -o "${PTAU_FILE}"
fi

# ── 5. Groth16 trusted setup ────────────────────────────────────────
echo "==> [3/5] groth16 setup"
snarkjs groth16 setup access_control.r1cs "${PTAU_FILE}" access_control_0000.zkey

echo "==> [4/5] phase-2 contribution"
snarkjs zkey contribute access_control_0000.zkey access_control_0001.zkey \
  --name="ZKHealthPass v1" -e "$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')"

echo "==> [5/5] exporting verification key"
snarkjs zkey export verificationkey access_control_0001.zkey verification_key.json

# ── 6. Copy artifacts to backend ────────────────────────────────────
mkdir -p "${BACKEND_CIRCUITS}"
cp access_control_js/access_control.wasm "${BACKEND_CIRCUITS}/access_control.wasm"
cp access_control_0001.zkey "${BACKEND_CIRCUITS}/access_control_final.zkey"
cp verification_key.json "${BACKEND_CIRCUITS}/verification_key.json"

# ── 7. Report ───────────────────────────────────────────────────────
echo ""
echo "Constraint report:"
snarkjs r1cs info access_control.r1cs
snarkjs r1cs print access_control.r1cs access_control.sym | head -n 20

echo ""
echo "Artifacts copied to backend/src/circuits/:"
ls -lh "${BACKEND_CIRCUITS}"
echo ""
echo "Next: cd backend && npm install && npm test"