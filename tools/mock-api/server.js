'use strict';

/**
 * ZKHealthPass MOCK REST API — in-memory, no Fabric/Postgres.
 * Implements the frozen contract in doc/teammate-b-handoff.md §4.
 *
 * Run:  npm install && npm start   (listens on http://localhost:3001)
 * Frontend Vite dev server proxies /v1 → localhost:3001, so no changes needed.
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { store } = require('./store');

const app = express();
const PORT = process.env.PORT || 3001;

// Dev-only secret — NOT for production (the real backend has its own).
const JWT_SECRET = 'mock-api-dev-secret-0001';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use((req, _res, next) => {
  console.log(`[mock] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function signTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, userId: user.userId, role: user.role, walletId: user.walletId, orgId: user.orgId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const refreshToken = jwt.sign(
    { id: user.id, tokenId: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken, expiresIn: 3600, role: user.role };
}

function authError(res, code, message, statusCode = 401) {
  res.status(statusCode).json({
    error: { code, message, statusCode, requestId: `req_${crypto.randomBytes(4).toString('hex')}` },
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return authError(res, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.user = {
      id: decoded.id,
      userId: decoded.userId,
      role: decoded.role,
      walletId: decoded.walletId,
      orgId: decoded.orgId,
    };
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    authError(res, code, code === 'TOKEN_EXPIRED' ? 'Access token has expired' : 'Invalid access token');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return authError(res, 'FORBIDDEN', `This action requires one of: ${roles.join(', ')}. Your role: ${req.user.role}`, 403);
    }
    next();
  };
}

function isISODate(s) {
  return typeof s === 'string' && !isNaN(new Date(s).getTime());
}

// ── AUTH ───────────────────────────────────────────────────────────────

app.post('/v1/auth/register', (req, res) => {
  const { userId, password, role } = req.body || {};
  if (!userId || typeof userId !== 'string') return authError(res, 'VALIDATION', 'userId is required', 400);
  if (!password || typeof password !== 'string' || password.length < 8) {
    return authError(res, 'VALIDATION', 'password must be at least 8 characters', 400);
  }
  if (!['PATIENT', 'PROVIDER'].includes(role)) {
    return authError(res, 'VALIDATION', 'role must be PATIENT or PROVIDER', 400);
  }
  if (store.getUser(userId)) {
    return authError(res, 'USER_EXISTS', 'A user with this ID already exists', 409);
  }
  const user = store.addUser({
    userId,
    password,
    role,
    orgId: role === 'PROVIDER' ? 'Org2MSP' : 'Org1MSP',
  });
  res.status(201).json({ walletId: user.walletId, message: 'User registered successfully' });
});

app.post('/v1/auth/login', (req, res) => {
  const { userId, password } = req.body || {};
  const user = store.getUser(userId);
  if (!user || user.password !== password) {
    return authError(res, 'UNAUTHORIZED', 'Invalid credentials');
  }
  res.json(signTokens(user));
});

app.post('/v1/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return authError(res, 'UNAUTHORIZED', 'Invalid refresh token');
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const match = Array.from(store.users.values()).find((u) => u.id === decoded.id);
    if (!match) return authError(res, 'UNAUTHORIZED', 'User not found');
    res.json(signTokens(store.getUser(match.userId)));
  } catch {
    authError(res, 'UNAUTHORIZED', 'Invalid refresh token');
  }
});

app.delete('/v1/auth/logout', requireAuth, (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// ── CONSENT (PATIENT) ──────────────────────────────────────────────────

app.get('/v1/consent', requireAuth, requireRole('PATIENT'), (req, res) => {
  res.json(store.policiesFor(req.user.userId));
});

app.post('/v1/consent', requireAuth, requireRole('PATIENT'), (req, res) => {
  const b = req.body || {};
  if (!b.providerId) return authError(res, 'VALIDATION', 'providerId is required', 400);
  if (!Array.isArray(b.allowedCategories) || b.allowedCategories.length === 0) {
    return authError(res, 'VALIDATION', 'allowedCategories must be a non-empty array', 400);
  }
  if (!isISODate(b.validFrom) || !isISODate(b.validUntil)) {
    return authError(res, 'VALIDATION', 'validFrom and validUntil must be valid ISO-8601 dates', 400);
  }
  if (new Date(b.validUntil) <= new Date(b.validFrom)) {
    return authError(res, 'VALIDATION', 'validUntil must be after validFrom', 400);
  }
  const policy = store.createPolicy({
    patientUserId: req.user.userId,
    providerId: b.providerId,
    allowedCategories: b.allowedCategories,
    validFrom: b.validFrom,
    validUntil: b.validUntil,
    maxAccessCount: b.maxAccessCount,
    purpose: b.purpose,
  });
  res.status(201).json({ policyId: policy.policyId, policyHash: policy.policyHash, status: policy.status });
});

app.put('/v1/consent/:policyId', requireAuth, requireRole('PATIENT'), (req, res) => {
  const updated = store.updatePolicy(req.params.policyId, req.body || {});
  if (!updated) return authError(res, 'POLICY_NOT_FOUND', 'Consent policy does not exist', 404);
  res.json({ policyId: updated.policyId, status: updated.status, updatedAt: updated.updatedAt });
});

app.delete('/v1/consent/:policyId', requireAuth, requireRole('PATIENT'), (req, res) => {
  const revoked = store.revokePolicy(req.params.policyId);
  if (!revoked) return authError(res, 'POLICY_NOT_FOUND', 'Consent policy does not exist', 404);
  res.json({ policyId: revoked.policyId, status: revoked.status });
});

app.get('/v1/consent/:policyId/access-log', requireAuth, requireRole('PATIENT'), (req, res) => {
  const result = store.queryAudit({ policyId: req.params.policyId });
  res.json(result);
});

// ── PROOF ─────────────────────────────────────────────────────────────

app.post('/v1/proof/generate', requireAuth, requireRole('PATIENT'), (req, res) => {
  const b = req.body || {};
  if (!b.providerId) return authError(res, 'VALIDATION', 'providerId is required', 400);
  if (!Array.isArray(b.recordCategories) || b.recordCategories.length === 0) {
    return authError(res, 'VALIDATION', 'recordCategories must be a non-empty array', 400);
  }
  if (!isISODate(b.expiry)) return authError(res, 'VALIDATION', 'expiry must be a valid ISO-8601 date', 400);

  const policy = store.getPolicy(b.consentPolicyId);
  if (!policy) return authError(res, 'POLICY_NOT_FOUND', 'Consent policy not found', 404);
  if (policy.status !== 'ACTIVE' || new Date() > new Date(policy.validUntil)) {
    return authError(res, 'POLICY_INACTIVE', `Policy is ${policy.status}`, 403);
  }

  const result = store.addProof({
    patientUserId: req.user.userId,
    providerId: b.providerId,
    policyId: b.consentPolicyId,
    expiryISO: b.expiry,
  });
  res.json(result);
});

app.post('/v1/proof/verify', requireAuth, requireRole('PROVIDER'), (req, res) => {
  const b = req.body || {};
  if (!b.proofId) return authError(res, 'INVALID_PROOF', 'proofId is required', 400);
  if (!b.proof || !b.proof.pi_a || !b.proof.pi_b || !b.proof.pi_c) {
    return authError(res, 'INVALID_PROOF', 'zk-SNARK proof is malformed', 400);
  }
  if (!Array.isArray(b.publicSignals) || b.publicSignals.length === 0) {
    return authError(res, 'INVALID_PROOF', 'publicSignals are required', 400);
  }

  const proof = store.getProof(b.proofId);
  if (!proof) return authError(res, 'INVALID_PROOF', 'Unknown proof — generate it first', 400);
  if (proof.status === 'CONSUMED') {
    return authError(res, 'PROOF_REPLAYED', 'PROOF_REPLAYED: Proof already consumed', 409);
  }
  if (Date.now() > new Date(proof.expiresAt).getTime()) {
    return authError(res, 'PROOF_EXPIRED', 'PROOF_EXPIRED: Proof has expired', 400);
  }

  const policy = store.getPolicy(proof.policyId);
  if (!policy) return authError(res, 'POLICY_NOT_FOUND', 'POLICY_NOT_FOUND: Consent policy does not exist', 404);
  if (policy.status !== 'ACTIVE' || Date.now() > new Date(policy.validUntil).getTime()) {
    return authError(res, 'POLICY_INACTIVE', `POLICY_INACTIVE: Policy is ${policy.status}`, 403);
  }

  const granted = store.consumeProof(b.proofId);
  res.json({ valid: true, ...granted });
});

app.get('/v1/proof/:proofId', requireAuth, (req, res) => {
  const proof = store.getProof(req.params.proofId);
  if (!proof) return res.json({ proofId: req.params.proofId, status: 'UNUSED' });
  res.json({ proofId: proof.proofId, status: proof.status });
});

// ── AUDIT ─────────────────────────────────────────────────────────────

app.get('/v1/audit', requireAuth, requireRole('PATIENT', 'PROVIDER', 'ADMIN'), (req, res) => {
  res.json(store.queryAudit({ ...req.query, limit: req.query.limit }));
});

app.get('/v1/audit/:auditId', requireAuth, requireRole('PATIENT', 'PROVIDER', 'ADMIN'), (req, res) => {
  const event = store.getAuditEvent(req.params.auditId);
  if (!event) return authError(res, 'NOT_FOUND', 'Audit event not found', 404);
  res.json(event);
});

// ── Fallback + start ──────────────────────────────────────────────────

app.use((_req, res) => {
  authError(res, 'NOT_FOUND', 'Endpoint not found', 404);
});

app.listen(PORT, () => {
  console.log(`ZKHealthPass MOCK API listening on http://localhost:${PORT}`);
  console.log('Demo users: alice/alicepw (PATIENT) · drbob/bobpw (PROVIDER)');
});