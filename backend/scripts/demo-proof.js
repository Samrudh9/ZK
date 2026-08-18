const { generateProof, verifyProof, hashIds } = require('../src/services/proof.service');

const PATIENT_ID = '123456789';
const PROVIDER_ID = '987654321';

(async () => {
  console.log('=== ZKHealthPass — proof pipeline demo ===\n');

  console.log(`patient  : ${PATIENT_ID}  (never revealed by the proof)`);
  console.log(`provider : ${PROVIDER_ID} (never revealed by the proof)`);

  const { patientIdHash, providerIdHash } = hashIds(PATIENT_ID, PROVIDER_ID);
  console.log(`\nhashes (Poseidon):`);
  console.log(`  patientIdHash : ${patientIdHash}`);
  console.log(`  providerIdHash: ${providerIdHash}`);

  const inputs = {
    patientId: PATIENT_ID,
    providerId: PROVIDER_ID,
    patientIdHash,
    providerIdHash,
    policyHash: '12345678901234567890123456789012',
    expiry: '1893456000',
    nonce: '1700000000',
  };

  const { proof, publicSignals, durationMs } = await generateProof(inputs);

  console.log(`\nPROOF GENERATED in ${durationMs} ms`);
  console.log(`proof size: ${JSON.stringify(proof).length} bytes`);
  console.log('public signals (what the verifier sees):');
  console.log(`  [0] valid         = ${publicSignals[0]}`);
  console.log(`  [1] patientIdHash = ${publicSignals[1]}`);
  console.log(`  [2] providerIdHash= ${publicSignals[2]}`);
  console.log(`  [3] policyHash    = ${publicSignals[3]}`);
  console.log(`  [4] expiry        = ${publicSignals[4]}`);
  console.log(`  [5] nonce         = ${publicSignals[5]}`);
  console.log('  (no patientId / providerId in there — zero knowledge!)');

  const { isValid, durationMs: verifyMs } = await verifyProof(proof, publicSignals);
  console.log(`\nVERIFICATION in ${verifyMs} ms → isValid: ${isValid}`);

  const tampered = publicSignals.slice();
  tampered[3] = '99999999999999999999999999999999';
  const { isValid: tamperedOk } = await verifyProof(proof, tampered);
  console.log(`\nTampered policyHash → isValid: ${tamperedOk}  (rejected ✓)`);

  console.log('\n=== done ===');
  process.exit(0);
})().catch((e) => { console.error('demo failed:', e.message); process.exit(1); });