const path = require('path');
const snarkjs = require('snarkjs');
const { poseidon } = require('circomlibjs');

const DEFAULT_CIRCUIT_DIR = path.join(__dirname, '..', 'circuits');

function circuitPath(envVar, fileName) {
  return process.env[envVar] || path.join(DEFAULT_CIRCUIT_DIR, fileName);
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
  const vkey = require(circuitPath('CIRCUIT_VKEY_PATH', 'verification_key.json'));

  const start = Date.now();
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const durationMs = Date.now() - start;

  console.log(`[proof.service] verification: ${durationMs}ms`);
  return { isValid, durationMs };
}

module.exports = { generateProof, verifyProof, hashIds };