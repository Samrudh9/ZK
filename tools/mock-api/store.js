'use strict';

/**
 * In-memory data store for the ZKHealthPass mock API.
 * Mirrors the shapes returned by the real chaincode + REST API (see
 * doc/teammate-b-handoff.md §4). Everything resets on restart.
 */

const crypto = require('crypto');

const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Stand-in for the Poseidon id-hash used by the real system. Any consistent
// per-id value is fine for UI development; the real backend uses circomlibjs.
const mockHashId = (id) => sha256hex(`patient:${id}`);

// Reduce a 64-hex hash to a circuit field element (matches real toFieldToken).
const toFieldToken = (hexStr) => (toBigInt(hexStr) % FIELD_PRIME).toString();
const toBigInt = (hexStr) => BigInt(`0x${hexStr}`);

// Canonical policy hash — same algorithm as backend/chaincode consentManager.
function computePolicyHash(p) {
  const canonical = JSON.stringify({
    patientIdHash: p.patientIdHash,
    providerId: p.providerId,
    allowedCategories: p.allowedCategories.slice().sort(),
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    maxAccessCount: p.maxAccessCount || 0,
    purpose: p.purpose || '',
  });
  return sha256hex(canonical);
}

const rndHex = (n) => crypto.randomBytes(n).toString('hex');

class Store {
  constructor() {
    this.users = new Map();     // userId -> user record
    this.policies = [];         // consent policies
    this.proofs = new Map();    // proofId -> proof record
    this.auditEvents = [];

    this.seed();
  }

  seed() {
    // ── Demo users (match the Login page + handoff doc) ──────────────
    this.addUser({ userId: 'alice', password: 'alicepw', role: 'PATIENT', orgId: 'Org1MSP' });
    this.addUser({ userId: 'drbob', password: 'bobpw', role: 'PROVIDER', orgId: 'Org2MSP' });

    // ── One ready-to-use ACTIVE consent policy for alice → drbob ─────
    const patientIdHash = mockHashId('alice');
    const policy = {
      docType: 'consentPolicy',
      policyId: 'cp_seed1234567890',
      policyHash: null, // filled below
      patientIdHash,
      providerId: 'drbob',
      allowedCategories: ['Allergy', 'Vaccination'],
      purpose: 'cardiology follow-up',
      validFrom: new Date(Date.now() - 86400000).toISOString(),
      validUntil: new Date(Date.now() + 365 * 86400000).toISOString(),
      maxAccessCount: 5,
      accessCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      patientUserId: 'alice',
    };
    policy.policyHash = computePolicyHash(policy);
    this.policies.push(policy);

    this.addAudit({
      auditId: `aud_${rndHex(8)}`,
      patientIdHash,
      providerId: 'drbob',
      category: policy.allowedCategories,
      action: 'CONSENT_CREATED',
      policyId: policy.policyId,
      proofId: '',
      txId: `tx_${rndHex(8)}`,
      timestamp: policy.createdAt,
    });
  }

  addUser({ userId, password, role, orgId }) {
    const user = {
      id: crypto.randomUUID(),
      userId,
      role,
      orgId,
      walletId: crypto.randomUUID(),
      password,
      createdAt: new Date().toISOString(),
    };
    this.users.set(userId, user);
    return user;
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  policiesFor(userId) {
    return this.policies
      .filter((p) => p.patientUserId === userId)
      .map((p) => this.sanitizePolicy(p));
  }

  getPolicy(policyId) {
    return this.policies.find((p) => p.policyId === policyId) || null;
  }

  sanitizePolicy(p) {
    const { patientUserId, ...pub } = p;
    return pub;
  }

  createPolicy({ patientUserId, providerId, allowedCategories, validFrom, validUntil, maxAccessCount, purpose }) {
    const patientIdHash = mockHashId(patientUserId);
    const policy = {
      docType: 'consentPolicy',
      policyId: `cp_${rndHex(8)}`,
      policyHash: null,
      patientIdHash,
      providerId,
      allowedCategories,
      purpose: purpose || '',
      validFrom,
      validUntil,
      maxAccessCount: maxAccessCount || 0,
      accessCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      patientUserId,
    };
    policy.policyHash = computePolicyHash(policy);
    this.policies.push(policy);

    this.addAudit({
      auditId: `aud_${rndHex(8)}`,
      patientIdHash,
      providerId,
      category: allowedCategories,
      action: 'CONSENT_CREATED',
      policyId: policy.policyId,
      proofId: '',
      txId: `tx_${rndHex(8)}`,
      timestamp: policy.createdAt,
    });

    return policy;
  }

  updatePolicy(policyId, updates) {
    const p = this.getPolicy(policyId);
    if (!p) return null;
    if (updates.allowedCategories) p.allowedCategories = updates.allowedCategories;
    if (updates.validUntil) p.validUntil = updates.validUntil;
    if (updates.maxAccessCount !== undefined) p.maxAccessCount = updates.maxAccessCount;
    if (updates.purpose !== undefined) p.purpose = updates.purpose;
    p.updatedAt = new Date().toISOString();
    p.policyHash = computePolicyHash(p);
    return p;
  }

  revokePolicy(policyId) {
    const p = this.getPolicy(policyId);
    if (!p) return null;
    p.status = 'REVOKED';
    p.updatedAt = new Date().toISOString();
    this.addAudit({
      auditId: `aud_${rndHex(8)}`,
      patientIdHash: p.patientIdHash,
      providerId: p.providerId,
      category: p.allowedCategories,
      action: 'CONSENT_REVOKED',
      policyId,
      proofId: '',
      txId: `tx_${rndHex(8)}`,
      timestamp: p.updatedAt,
    });
    return p;
  }

  // ── Proofs ─────────────────────────────────────────────────────────

  addProof({ patientUserId, providerId, policyId, expiryISO }) {
    const policy = this.getPolicy(policyId);
    const proofId = `prf_${rndHex(8)}`;
    const now = Date.now();
    const expiresAt = new Date(expiryISO).getTime();

    const publicSignals = [
      '1',
      mockHashId(patientUserId),
      mockHashId(providerId),
      toFieldToken(policy.policyHash),
      String(Math.floor(expiresAt / 1000)),
      rndHex(16),
    ];

    const record = {
      proofId,
      patientUserId,
      providerId,
      policyId,
      status: 'GENERATED',
      generatedAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      publicSignals,
      proof: fixtureProof(),
    };

    this.proofs.set(proofId, record);

    this.addAudit({
      auditId: `aud_${rndHex(8)}`,
      patientIdHash: mockHashId(patientUserId),
      providerId,
      category: policy.allowedCategories,
      action: 'PROOF_GENERATED',
      policyId,
      proofId,
      txId: '',
      timestamp: record.generatedAt,
    });

    return {
      proofId,
      proof: record.proof,
      publicSignals,
      generatedAt: record.generatedAt,
      expiresAt: record.expiresAt,
      durationMs: 500 + Math.floor(Math.random() * 400),
    };
  }

  getProof(proofId) {
    return this.proofs.get(proofId) || null;
  }

  consumeProof(proofId) {
    const p = this.getProof(proofId);
    if (!p) return null;
    p.status = 'CONSUMED';

    const policy = this.getPolicy(p.policyId);
    if (policy) {
      policy.accessCount = (policy.accessCount || 0) + 1;
      if (policy.maxAccessCount > 0 && policy.accessCount >= policy.maxAccessCount) {
        policy.status = 'EXHAUSTED';
      }
      policy.updatedAt = new Date().toISOString();
    }

    const txId = `tx_${rndHex(8)}`;
    const auditId = `aud_${rndHex(8)}`;
    const audit = {
      auditId,
      patientIdHash: mockHashId(p.patientUserId),
      providerId: p.providerId,
      category: policy ? policy.allowedCategories : [],
      action: 'ACCESS_GRANTED',
      policyId: p.policyId,
      proofId,
      txId,
      timestamp: new Date().toISOString(),
    };
    this.addAudit(audit);

    return {
      accessGranted: true,
      authorizedCategories: policy ? policy.allowedCategories : [],
      auditRef: auditId,
      txId,
    };
  }

  // ── Audit ──────────────────────────────────────────────────────────

  addAudit(event) {
    this.auditEvents.push({ docType: 'auditEvent', ...event });
  }

  queryAudit(filters = {}) {
    let events = this.auditEvents.slice();
    if (filters.patientIdHash) events = events.filter((e) => e.patientIdHash === filters.patientIdHash);
    if (filters.providerId) events = events.filter((e) => e.providerId === filters.providerId);
    if (filters.action) events = events.filter((e) => e.action === filters.action);
    if (filters.policyId) events = events.filter((e) => e.policyId === filters.policyId);
    if (filters.fromDate) events = events.filter((e) => new Date(e.timestamp) >= new Date(filters.fromDate));
    if (filters.toDate) events = events.filter((e) => new Date(e.timestamp) <= new Date(filters.toDate));
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limit = filters.limit ? Number(filters.limit) : 100;
    const sliced = events.slice(0, limit);
    return { total: sliced.length, events: sliced };
  }

  getAuditEvent(auditId) {
    return this.auditEvents.find((e) => e.auditId === auditId) || null;
  }
}

// A realistic-looking (but not cryptographically valid) Groth16/bn128 proof.
// The mock does not verify proofs; the real backend uses snarkjs.
function fixtureProof() {
  const big = () => {
    const hex = rndHex(30);
    return BigInt(`0x${hex}`).toString();
  };
  return {
    pi_a: [big(), big(), '1'],
    pi_b: [
      [big(), big()],
      [big(), big()],
      ['1', '0'],
    ],
    pi_c: [big(), big()],
    protocol: 'groth16',
    curve: 'bn128',
  };
}

const store = new Store();

module.exports = {
  store,
  sha256hex,
  mockHashId,
  toFieldToken,
  computePolicyHash,
  FIELD_PRIME: FIELD_PRIME.toString(),
  fixtureProof,
};