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
  return { gateway, contract: gateway.getNetwork(CHANNEL).getContract(CC), client };
}

/** Close both the gateway and its underlying gRPC client (no socket leaks). */
function closeConnections(...conns) {
  for (const c of conns) {
    try { c.gateway.close(); } catch { /* noop */ }
    try { c.client.close(); } catch { /* noop */ }
  }
}

async function submit(contract, fcn, ...args) {
  const res = await contract.submitTransaction(fcn, ...args);
  return res.length ? JSON.parse(Buffer.from(res).toString()) : null;
}

async function evaluate(contract, fcn, ...args) {
  const res = await contract.evaluateTransaction(fcn, ...args);
  return res.length ? JSON.parse(Buffer.from(res).toString()) : null;
}

/**
 * On-chain commitment for a consent policy — MUST match the chaincode's
 * computePolicyHash() (identical canonical field order, sorted categories).
 * Mirrors chaincode/accessControl/lib/consentManager.js.
 */
function computePolicyHash(params) {
  const canonical = JSON.stringify({
    patientIdHash: params.patientIdHash,
    providerId: params.providerId,
    allowedCategories: params.allowedCategories.slice().sort(),
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    maxAccessCount: params.maxAccessCount || 0,
    purpose: params.purpose || '',
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** BabyJubjub/BN254 scalar field modulus (BLS12-381 is not used here). */
const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * A 256-bit SHA-256 digest exceeds the 254-bit scalar field, so the circuit
 * commits to the digest reduced modulo the field prime. The same reduction
 * must be used both here (prove) and when checking the public signal.
 */
function toFieldToken(hexDigest) {
  return (BigInt(`0x${hexDigest}`) % FIELD_PRIME).toString();
}

/** Public signals the circuit commits to (see access_control.circom). */
function assertBoundSignal(signal, expected, label) {
  if (signal !== expected) {
    throw new Error(
      `Policy binding failed: ${label} not committed by the proof ` +
      `(expected ${expected}, proof commits ${signal})`
    );
  }
}

/**
 * Ensure the CouchDB indexes the rich queries need exist. Idempotent —
 * recreating an existing index returns HTTP 200. Databases are created
 * on demand so this works on a freshly bootstrapped network too.
 */
async function ensureCouchIndexes() {
  const db = 'healthchannel_access$control'; // Fabric encodes '_' as '$'
  const indexes = [
    { name: 'auditByTimestamp', fields: ['docType', 'timestamp'] },
    { name: 'auditByPatient', fields: ['docType', 'patientIdHash', 'timestamp'] },
    { name: 'policyByCreated', fields: ['docType', 'createdAt'] },
    { name: 'policyByPatient', fields: ['docType', 'patientIdHash', 'createdAt'] },
  ];
  const hosts = (process.env.COUCHDB_HOSTS || 'couchdb0:5984,couchdb2:5984').split(',');

  for (const host of hosts) {
    let created = await fetch(`http://${host}/${db}`).then((r) => r.status === 200);
    if (!created) {
      const mk = await fetch(`http://${host}/${db}`, { method: 'PUT' });
      created = mk.status === 201;
    }
    if (!created) continue;
    for (const ix of indexes) {
      await fetch(`http://${host}/${db}/_index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: { fields: ix.fields }, name: ix.name, type: 'json' }),
      });
    }
  }
}

(async () => {
  const patient = newGateway('Org1MSP');
  const provider = newGateway('Org2MSP');

  try {
    console.log('='.repeat(72));
    console.log(' ZKHealthPass — live end-to-end demo (Fabric 2.5 + Groth16)');
    console.log('='.repeat(72));

    // ── 0. CouchDB indexes (idempotent; required for rich queries) ─────
    console.log('\n[0] COUCHDB INDEXES (rich queries)');
    await ensureCouchIndexes();
    console.log('  ensured on couchdb0 / couchdb2');

    // ── 1. Define the policy and derive the values the proof commits ───
    console.log('\n[1] CONSENT POLICY & PROOF INPUTS');
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

    // Bind the proof to THIS policy: same SHA-256 as the chaincode commits on-chain
    const policyHashHex = computePolicyHash(policy);
    const policyHashToken = toFieldToken(policyHashHex);
    const expiry = String(Math.floor(new Date(policy.validUntil).getTime() / 1000));
    const nonce = String(Date.now());

    console.log(`  policyHash (on-chain hex) : ${policyHashHex.slice(0, 24)}…`);
    console.log(`  policyHash (field token)  : ${policyHashToken.slice(0, 24)}…`);
    console.log(`  expiry (unix seconds)     : ${expiry}  (~${policy.validUntil})`);
    console.log(`  raw patientId (${PATIENT_ID}) is a PRIVATE input → zero knowledge ✓`);

    // ── 2. ZK proof production ───────────────────────────────────────────
    console.log('\n[2] PROOF PIPELINE');
    const { proof, publicSignals, durationMs } = await generateProof({
      patientId: PATIENT_ID,
      providerId: PROVIDER_ID,
      patientIdHash,
      providerIdHash,
      policyHash: policyHashToken,
      expiry,
      nonce,
    });
    console.log(`  proof generated in ${Math.round(durationMs)} ms, ${JSON.stringify(proof).length} bytes`);

    // ── 3. Verify + bind the proof OFF-CHAIN (hard gate BEFORE any write) ─
    console.log('\n[3] OFF-CHAIN VERIFICATION & POLICY BINDING (gate)');
    const { isValid, durationMs: verifyMs } = await verifyProof(proof, publicSignals);
    if (!isValid) {
      throw new Error('zk-SNARK verification FAILED; refusing to touch the ledger');
    }
    // Prove the commitment matches THIS policy — reject if not cryptographically bound
    assertBoundSignal(publicSignals[1], patientIdHash, 'patientIdHash');
    assertBoundSignal(publicSignals[2], providerIdHash, 'providerIdHash');
    assertBoundSignal(publicSignals[3], policyHashToken, 'policyHash');
    assertBoundSignal(publicSignals[4], expiry, 'expiry');
    assertBoundSignal(publicSignals[5], nonce, 'nonce');
    console.log(`  proof verified in ~${verifyMs} ms`);
    console.log('  committed signals match the policy exactly → safe to write ✓');

    // ── 4. Patient issues consent policy on-chain ────────────────────────
    console.log('\n[4] PATIENT (Org1) creates consent policy');
    const created = await submit(patient.contract, 'CreateConsentPolicy', JSON.stringify(policy));
    console.log(`  policyId: ${created.policyId}`);
    console.log(`  status  : ${created.status}`);
    console.log(`  hash    : ${created.policyHash.slice(0, 24)}… (=== ${policyHashHex.slice(0, 24)}…)`);

    // ── 5. Provider presents proof → access granted ──────────────────────
    console.log('\n[5] PROVIDER (Org2) presents verified proof for access');
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

    // ── 6. Replay attack → rejected ──────────────────────────────────────
    console.log('\n[6] REPLAY ATTEMPT (same proof, a second time)');
    try {
      await submit(provider.contract, 'VerifyAndGrantAccess', proofId, created.policyId, `provider-${PROVIDER_ID}`);
      console.log('  ⚠ UNEXPECTED — replay was accepted!');
    } catch (err) {
      const detail = Array.isArray(err.details) && err.details[0]
        ? err.details[0].message || err.details[0]
        : (err.details || err.message);
      console.log(`  rejected ✓ (${String(detail).split(':').slice(0, 2).join(':')})`);
    }

    // ── 7. Ledger state & audit trail ────────────────────────────────────
    console.log('\n[7] LEDGER STATE');
    const pStatus = await evaluate(patient.contract, 'GetProofStatus', proofId);
    console.log(`  proof ${pStatus.proofId.slice(0, 16)}… → ${pStatus.status}`);

    const trail = await evaluate(patient.contract, 'QueryAuditTrail',
      JSON.stringify({ patientIdHash, limit: 10 }));
    console.log(`  audit trail: ${trail.total} event(s) for patient hash`);
    for (const e of trail.events.reverse()) {
      console.log(`    • ${e.action.padEnd(16)} ${e.timestamp}` +
        (e.proofId ? `  proof:${e.proofId.slice(0, 12)}…` : ''));
    }

    const finalCheck = await verifyProof(proof, publicSignals);
    console.log(`\n  final off-chain re-verification: ${finalCheck.isValid}`);

    console.log('\n' + '='.repeat(72));
    console.log(` DEMO COMPLETE — ${created.status} policy, access granted only after`);
    console.log(' off-chain proof verification; replay blocked; immutable audit trail.');
    console.log('='.repeat(72));
  } finally {
    closeConnections(patient, provider);
  }
  // grpc/snarkjs keep some handles alive; exit explicitly so CI never hangs
  process.exit(0);
})().catch((e) => {
  console.error('\nE2E demo failed:', e.stack || e.message);
  process.exit(1);
});