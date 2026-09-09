const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const snarkjs = require('snarkjs');
const { poseidon } = require('circomlibjs');

const DEFAULT_CIRCUIT_DIR = path.join(__dirname, '..', 'circuits');

// BabyJubjub/BN254 scalar field modulus (the circuit's native field).
const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Resolve a circuit artifact path to an ABSOLUTE path, independent of the
 * process CWD. Env overrides may be given relative to backend/ (e.g. from
 * .env as ./src/circuits/...); those are rebased onto the backend root.
 */
function circuitPath(envVar, fileName) {
  const envPath = process.env[envVar];
  if (!envPath) return path.join(DEFAULT_CIRCUIT_DIR, fileName);
  return path.isAbsolute(envPath) ? envPath : path.resolve(__dirname, '..', '..', envPath);
}

/**
 * Reduce a 256-bit SHA-256 digest into a field element. The circuit commits
 * to the digest reduced modulo the field prime; any consumer binding a proof
 * to an on-chain policyHash MUST use the same reduction.
 */
function toFieldToken(hexDigest) {
  return (BigInt(`0x${hexDigest}`) % FIELD_PRIME).toString();
}

/**
 * Map an arbitrary string identifier (e.g. 'alice') to a deterministic,
 * field-safe, non-reversible number. Used for BOTH the Poseidon hash inputs
 * (consent route) and the circuit's private patientId/providerId inputs
 * (proof route), so both sides commit to the same value.
 */
function toFieldId(id) {
  const hex = crypto.createHash('sha256').update(String(id)).digest('hex');
  return toFieldToken(hex);
}

// Compute the Poseidon hashes the circuit expects as public inputs.
// patientId/providerId must be field-safe (numeric or hex strings).
function hashIds(patientId, providerId) {
  return {
    patientIdHash: poseidon([patientId, 0]).toString(),
    providerIdHash: poseidon([providerId, 0]).toString(),
  };
}

async function generateProof(inputs) {
  const wasm = circuitPath('CIRCUIT_WASM_PATH', 'access_control.wasm');
  const zkey = circuitPath('CIRCUIT_ZKEY_PATH', 'access_control_final.zkey');

  const start = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasm, zkey);
  const durationMs = Date.now() - start;

  console.log(`[proof.service] generation: ${durationMs}ms`);
  return { proof, publicSignals, durationMs };
}

async function verifyProof(proof, publicSignals) {
  const vkey = JSON.parse(fs.readFileSync(circuitPath('CIRCUIT_VKEY_PATH', 'verification_key.json'), 'utf8'));

  const start = Date.now();
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const durationMs = Date.now() - start;

  console.log(`[proof.service] verification: ${durationMs}ms`);
  return { isValid, durationMs };
}

module.exports = {
  generateProof,
  verifyProof,
  hashIds,
  toFieldToken,
  toFieldId,
};