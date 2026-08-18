const { generateProof, verifyProof, hashIds } = require('../src/services/proof.service');

// These tests require compiled artifacts in backend/src/circuits/
// (run circuits/build.sh first). Proof generation target: < 8s; tests
// allow up to 60s so they pass on slow machines.

const PATIENT_ID = '123456789';
const PROVIDER_ID = '987654321';

function buildInputs(overrides = {}) {
  const { patientIdHash, providerIdHash } = hashIds(PATIENT_ID, PROVIDER_ID);
  return {
    patientId: PATIENT_ID,
    providerId: PROVIDER_ID,
    patientIdHash,
    providerIdHash,
    policyHash: '12345678901234567890123456789012',
    expiry: '1893456000',   // 2030-01-01
    nonce: '1700000000',
    ...overrides,
  };
}

describe('proof.service', () => {
  test('valid input -> proof -> verify returns true', async () => {
    const { proof, publicSignals } = await generateProof(buildInputs());
    expect(Array.isArray(publicSignals)).toBe(true);

    const { isValid, durationMs } = await verifyProof(proof, publicSignals);
    expect(isValid).toBe(true);
    expect(durationMs).toBeLessThan(2000);
  }, 60000);

  test('tampered public signal -> verify returns false', async () => {
    const { proof, publicSignals } = await generateProof(buildInputs());

    const tampered = publicSignals.slice();
    tampered[1] = (BigInt(tampered[1]) + 1n).toString(); // flip patientIdHash

    const { isValid } = await verifyProof(proof, tampered);
    expect(isValid).toBe(false);
  }, 60000);

  test('wrong private input cannot produce a proof', async () => {
    // patientId does not match patientIdHash -> constraint fails -> throws
    await expect(generateProof(buildInputs({ patientId: '999999999' })))
      .rejects.toThrow();
  }, 60000);

  test('different nonce produces a different proof', async () => {
    const a = await generateProof(buildInputs({ nonce: '1' }));
    const b = await generateProof(buildInputs({ nonce: '2' }));

    expect(JSON.stringify(a.proof)).not.toBe(JSON.stringify(b.proof));
    expect(a.publicSignals[1]).toBe(b.publicSignals[1]);   // patientIdHash stays stable
    expect(a.publicSignals[5]).not.toBe(b.publicSignals[5]); // nonce is committed public signal
  }, 60000);
});