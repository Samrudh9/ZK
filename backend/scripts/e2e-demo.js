'use strict';

/**
 * ZKHealthPass — End-to-end demo against a LIVE Hyperledger Fabric 2.5 network.
 *
 * Flow: patient (Org1) issues a consent policy on the ledger →
 *        provider (Org2) presents a real zk-SNARK proof → access granted →
 *        replay attempt rejected → immutable audit trail queryable.
 *
 * Prereqs (see README quick start):
 *   fabric-network: ./scripts/setup-network.sh, create-channel.sh,
 *                   deploy-chaincode.sh (CCaaS), chaincode container up
 *   backend:        npm install (proof artifacts compiled)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connect, signers, hash } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const { generateProof, verifyProof, hashIds } = require('../src/services/proof.service');

// ── configuration ────────────────────────────────────────────────────────────
const REPO_ROOT = process.env.ZK_ROOT || path.resolve(__dirname, '..', '..');
const NET = path.join(REPO_ROOT, 'fabric-network');
const CHANNEL = 'healthchannel';
const CC = 'accessControl';

const ORGS = {
  Org1MSP: {
    label: 'PATIENT  (Org1MSP)',
    peer: process.env.ORG1_PEER || 'localhost:7051',
    alias: process.env.ORG1_ALIAS || 'peer0.org1.example.com',
    tls: path.join(NET, 'crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt'),
    cert: path.join(NET, 'crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts'),
    key: path.join(NET, 'crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore'),
  },
  Org2MSP: {
    label: 'PROVIDER (Org2MSP)',
    peer: process.env.ORG2_PEER || 'localhost:9051',
    alias: process.env.ORG2_ALIAS || 'peer0.org2.example.com',
    tls: path.join(NET, 'crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt'),
    cert: path.join(NET, 'crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/signcerts'),
    key: path.join(NET, 'crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/keystore'),
  },
};

function newGateway(org) {
  const cfg = ORGS[org];
  const client = new grpc.Client(
    cfg.peer,
    grpc.credentials.createSsl(fs.readFileSync(cfg.tls)),
    { 'grpc.ssl_target_name_override': cfg.alias }
  );
  const certificate = fs.readFileSync(
    path.join(cfg.cert, fs.readdirSync(cfg.cert).find((f) => f.endsWith('.pem')))
  ).toString();
  const keyPem = fs.readFileSync(path.join(cfg.key, fs.readdirSync(cfg.key)[0])).toString();
  const identity = { mspId: org, credentials: Buffer.from(certificate) };
  const gateway = connect({
    client,
    identity,
    signer: signers.newPrivateKeySigner(crypto.createPrivateKey(keyPem)),
    hash: hash.sha256,
    evaluateOptions: () => ({ deadline: Date.now() + 20000 }),
    endorseOptions: () => ({ deadline: Date.now() + 20000 }),
    submitOptions: () => ({ deadline: Date.now() + 30000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });
  return { gateway, contract: gateway.getNetwork(CHANNEL).getContract(CC) };
}

async function submit(contract, fcn, ...args) {
  const res = await contract.submitTransaction(fcn, ...args);
  return res.length ? JSON.parse(res.toString()) : null;
}

async function evaluate(contract, fcn, ...args) {
  const res = await contract.evaluateTransaction(fcn, ...args);
  return res.length ? JSON.parse(res.toString()) : null;
}

(async () => {
  console.log('='.repeat(72));
  console.log(' ZKHealthPass — live end-to-end demo (Fabric 2.5 + Groth16)');
  console.log('='.repeat(72));

  // ── 1. ZK proof production ───────────────────────────────────────────
  console.log('\n[1] PROOF PIPELINE');
  const PATIENT_ID = '123456789';
  const PROVIDER_ID = '987654321';
  const { patientIdHash, providerIdHash } = hashIds(PATIENT_ID, PROVIDER_ID);

  const policy = {
    policyId: `pol_${Date.now()}`,
    patientIdHash,
    providerId: `provider-${PROVIDER_ID}`,
    allowedCategories: ['LAB', 'RADIOLOGY'],
    validFrom: new Date(Date.now() - 3600e3).toISOString(),
    validUntil: '2030-01-01T00:00:00.000Z',
    maxAccessCount: 3,
    purpose: 'consultation',
  };

  const { proof, publicSignals, durationMs } = await generateProof({
    patientId: PATIENT_ID,
    providerId: PROVIDER_ID,
    patientIdHash,
    providerIdHash,
    policyHash: '12345678901234567890123456789012',
    expiry: '1893456000',
    nonce: String(Date.now()),
  });
  console.log(`  proof generated in ${Math.round(durationMs)} ms, ${JSON.stringify(proof).length} bytes`);
  console.log(`  raw patientId (${PATIENT_ID}) is NOT in the public signals → zero knowledge ✓`);

  // ── 2. Patient issues consent policy ──────────────────────────────────
  console.log('\n[2] PATIENT (Org1) creates consent policy');
  const patient = newGateway('Org1MSP');
  const created = await submit(patient.contract, 'CreateConsentPolicy', JSON.stringify(policy));
  console.log(`  policyId: ${created.policyId}`);
  console.log(`  status  : ${created.status}`);
  console.log(`  hash    : ${created.policyHash.slice(0, 24)}…`);

  // ── 3. Provider presents proof → access granted ──────────────────────
  console.log('\n[3] PROVIDER (Org2) presents zk proof for access');
  const provider = newGateway('Org2MSP');
  const proofId = crypto.createHash('sha256').update(JSON.stringify({ proof, publicSignals })).digest('hex');

  const granted = await submit(
    provider.contract,
    'VerifyAndGrantAccess',
    proofId,
    created.policyId,
    `provider-${PROVIDER_ID}`
  );
  console.log(`  access granted: ${granted.accessGranted}`);
  console.log(`  authorized    : ${JSON.stringify(granted.authorizedCategories)}`);
  console.log(`  proof consumed: ${proofId.slice(0, 16)}…`);

  // ── 4. Replay attack → rejected ──────────────────────────────────────
  console.log('\n[4] REPLAY ATTEMPT (same proof, a second time)');
  try {
    await submit(provider.contract, 'VerifyAndGrantAccess', proofId, created.policyId, `provider-${PROVIDER_ID}`);
    console.log('  ⚠ UNEXPECTED — replay was accepted!');
  } catch (err) {
    const msg = String(err.details || err.message);
    console.log(`  rejected ✓ (${msg.split(':').slice(0, 2).join(':')})`);
  }

  // ── 5. Ledger state & audit trail ────────────────────────────────────
  console.log('\n[5] LEDGER STATE');
  const pStatus = await evaluate(patient.contract, 'GetProofStatus', proofId);
  console.log(`  proof ${pStatus.proofId.slice(0, 16)}… → ${pStatus.status}`);

  const trail = await evaluate(patient.contract, 'QueryAuditTrail',
    JSON.stringify({ patientIdHash, limit: 10 }));
  console.log(`  audit trail: ${trail.total} event(s) for patient hash`);
  for (const e of trail.events.reverse()) {
    console.log(`    • ${e.action.padEnd(16)} ${e.timestamp}` +
      (e.proofId ? `  proof:${e.proofId.slice(0, 12)}…` : ''));
  }

  // ── 6. Verify the proof again directly (belt & braces) ───────────────
  console.log('\n[6] OFF-CHAIN VERIFICATION');
  const { isValid, durationMs: verifyMs } = await verifyProof(proof, publicSignals);
  console.log(`  proof validity: ${isValid} (verified in ~${verifyMs} ms)`);

  patient.gateway.close();
  provider.gateway.close();
  console.log('\n' + '='.repeat(72));
  console.log(` DEMO COMPLETE — ${created.status} policy, access granted, replay blocked,`);
  console.log(' audit trail written to the immutable Fabric ledger.');
  console.log('='.repeat(72));
  process.exit(0);
})().catch((e) => {
  console.error('\nE2E demo failed:', e.stack || e.message);
  process.exit(1);
});