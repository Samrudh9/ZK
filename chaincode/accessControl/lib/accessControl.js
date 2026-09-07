'use strict';

const { Contract } = require('fabric-contract-api');
const { PolicyStatus, KEY } = require('./constants');
const {
  validatePolicyParams,
  computePolicyHash,
  isPolicyActive,
} = require('./consentManager');
const { buildAuditEvent, emitAuditEvent } = require('./auditLogger');

class AccessControlContract extends Contract {
  constructor() {
    super('AccessControlContract');
  }

  // ── helpers ───────────────────────────────────────────────────────

  /** Read JSON state, return parsed object or null. */
  async _getJSON(ctx, key) {
    const buf = await ctx.stub.getState(key);
    if (!buf || buf.length === 0) return null;
    return JSON.parse(buf.toString());
  }

  /** Write JSON state. */
  async _putJSON(ctx, key, obj) {
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(obj)));
  }

  /** Get the calling client's MSPID (Org1MSP = patients, Org2MSP = providers). */
  _callerMSP(ctx) {
    return ctx.clientIdentity.getMSPID();
  }

  /** Enforce that the caller belongs to the given MSP. */
  _requireMSP(ctx, mspId, action) {
    const caller = this._callerMSP(ctx);
    if (caller !== mspId) {
      throw new Error(
        `Access denied: ${action} requires ${mspId}, caller is ${caller}`
      );
    }
  }

  // ── 1. CreateConsentPolicy ────────────────────────────────────────

  /**
   * Create a new consent policy on the ledger.
   *
   * @param {Context} ctx
   * @param {string}  policyJSON — JSON string with:
   *   policyId, patientIdHash, providerId, allowedCategories[],
   *   validFrom, validUntil, maxAccessCount?, purpose?
   * @returns {object} { policyId, policyHash, status }
   */
  async CreateConsentPolicy(ctx, policyJSON) {
    this._requireMSP(ctx, 'Org1MSP', 'CreateConsentPolicy');

    const params = JSON.parse(policyJSON);
    validatePolicyParams(params);

    // Ensure policy doesn't already exist
    const existing = await this._getJSON(ctx, params.policyId);
    if (existing) {
      throw new Error(`Policy ${params.policyId} already exists`);
    }

    const policyHash = computePolicyHash(params);

    const policy = {
      docType: 'consentPolicy',
      policyId: params.policyId,
      policyHash,
      patientIdHash: params.patientIdHash,
      providerId: params.providerId,
      allowedCategories: params.allowedCategories,
      purpose: params.purpose || '',
      validFrom: params.validFrom,
      validUntil: params.validUntil,
      maxAccessCount: params.maxAccessCount || 0,
      accessCount: 0,
      status: PolicyStatus.ACTIVE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this._putJSON(ctx, params.policyId, policy);

    // Emit audit event
    const txId = ctx.stub.getTxID();
    const audit = buildAuditEvent({
      auditId: `aud_${txId.substring(0, 16)}`,
      patientIdHash: params.patientIdHash,
      providerId: params.providerId,
      category: params.allowedCategories,
      action: 'CONSENT_CREATED',
      policyId: params.policyId,
      txId,
      timestamp: new Date().toISOString(),
    });
    await this._putJSON(ctx, audit.auditId, audit);
    emitAuditEvent(ctx, 'ConsentCreated', audit);

    return JSON.stringify({
      policyId: policy.policyId,
      policyHash,
      status: policy.status,
    });
  }

  // ── 2. UpdateConsentPolicy ────────────────────────────────────────

  /**
   * Update an existing ACTIVE consent policy.
   * Only categories, expiry, maxAccessCount, and purpose can be changed.
   *
   * @param {Context} ctx
   * @param {string}  policyId
   * @param {string}  updatesJSON — JSON with optional fields to update
   */
  async UpdateConsentPolicy(ctx, policyId, updatesJSON) {
    this._requireMSP(ctx, 'Org1MSP', 'UpdateConsentPolicy');

    const policy = await this._getJSON(ctx, policyId);
    if (!policy) throw new Error(`Policy ${policyId} not found`);
    if (policy.status !== PolicyStatus.ACTIVE) {
      throw new Error(
        `Cannot update policy in ${policy.status} state`
      );
    }

    const updates = JSON.parse(updatesJSON);

    if (updates.allowedCategories) {
      if (!Array.isArray(updates.allowedCategories) || updates.allowedCategories.length === 0) {
        throw new Error('allowedCategories must be a non-empty array');
      }
      policy.allowedCategories = updates.allowedCategories;
    }
    if (updates.validUntil) {
      const until = new Date(updates.validUntil);
      if (isNaN(until.getTime())) throw new Error('Invalid validUntil date');
      policy.validUntil = updates.validUntil;
    }
    if (updates.maxAccessCount !== undefined) {
      const max = Number(updates.maxAccessCount);
      if (!Number.isInteger(max) || max < 0) {
        throw new Error('maxAccessCount must be a non-negative integer');
      }
      policy.maxAccessCount = max;
    }
    if (updates.purpose !== undefined) {
      policy.purpose = updates.purpose;
    }

    // Recompute hash after update
    policy.policyHash = computePolicyHash(policy);
    policy.updatedAt = new Date().toISOString();

    await this._putJSON(ctx, policyId, policy);

    return JSON.stringify({
      policyId: policy.policyId,
      policyHash: policy.policyHash,
      status: policy.status,
    });
  }

  // ── 3. RevokeConsentPolicy ────────────────────────────────────────

  /**
   * Revoke a consent policy. Immediate, irreversible.
   * Takes effect within one Fabric block (~2 seconds).
   */
  async RevokeConsentPolicy(ctx, policyId) {
    this._requireMSP(ctx, 'Org1MSP', 'RevokeConsentPolicy');

    const policy = await this._getJSON(ctx, policyId);
    if (!policy) throw new Error(`Policy ${policyId} not found`);
    if (policy.status === PolicyStatus.REVOKED) {
      throw new Error('Policy already revoked');
    }

    policy.status = PolicyStatus.REVOKED;
    policy.revokedAt = new Date().toISOString();
    policy.updatedAt = new Date().toISOString();

    await this._putJSON(ctx, policyId, policy);

    // Emit audit event
    const txId = ctx.stub.getTxID();
    const audit = buildAuditEvent({
      auditId: `aud_${txId.substring(0, 16)}`,
      patientIdHash: policy.patientIdHash,
      providerId: policy.providerId,
      category: policy.allowedCategories,
      action: 'CONSENT_REVOKED',
      policyId,
      txId,
      timestamp: new Date().toISOString(),
    });
    await this._putJSON(ctx, audit.auditId, audit);
    emitAuditEvent(ctx, 'ConsentRevoked', audit);

    return JSON.stringify({ policyId, status: PolicyStatus.REVOKED });
  }

  // ── 4. VerifyAndGrantAccess ───────────────────────────────────────

  /**
   * Core access-control function. Called by a provider after the backend
   * has already verified the zk-SNARK proof with snarkjs.
   *
   * Chaincode enforces the STATEFUL checks:
   *   1. Proof replay prevention (proofId not already CONSUMED)
   *   2. Policy is ACTIVE
   *   3. Policy is not expired
   *   4. Policy is not exhausted (accessCount < maxAccessCount)
   *
   * On success: marks proofId as CONSUMED, increments accessCount,
   * emits AccessGranted event.
   *
   * @param {Context} ctx
   * @param {string}  proofId       — unique proof identifier
   * @param {string}  policyId      — consent policy to check against
   * @param {string}  providerIdStr — provider identity (for audit)
   */
  async VerifyAndGrantAccess(ctx, proofId, policyId, providerIdStr) {
    this._requireMSP(ctx, 'Org2MSP', 'VerifyAndGrantAccess');

    // 1. Replay check
    const existingProof = await ctx.stub.getState(proofId);
    if (existingProof && existingProof.length > 0) {
      throw new Error('PROOF_REPLAYED: Proof already consumed');
    }

    // 2. Fetch and validate policy
    const policy = await this._getJSON(ctx, policyId);
    if (!policy) throw new Error('POLICY_NOT_FOUND: Consent policy does not exist');

    const { status, active } = isPolicyActive(policy);

    if (!active) {
      // Update the on-chain status if it drifted (expired/exhausted)
      if (policy.status === PolicyStatus.ACTIVE && status !== PolicyStatus.ACTIVE) {
        policy.status = status;
        policy.updatedAt = new Date().toISOString();
        await this._putJSON(ctx, policyId, policy);
      }

      // Emit denial audit
      const txId = ctx.stub.getTxID();
      const audit = buildAuditEvent({
        auditId: `aud_${txId.substring(0, 16)}`,
        patientIdHash: policy.patientIdHash,
        providerId: providerIdStr,
        category: policy.allowedCategories,
        action: 'ACCESS_DENIED',
        proofId,
        policyId,
        txId,
        timestamp: new Date().toISOString(),
      });
      await this._putJSON(ctx, audit.auditId, audit);
      emitAuditEvent(ctx, 'AccessDenied', audit);

      throw new Error(`POLICY_INACTIVE: Policy is ${status}`);
    }

    // 3. Mark proof as consumed (replay protection)
    await ctx.stub.putState(
      proofId,
      Buffer.from(JSON.stringify({
        status: 'CONSUMED',
        policyId,
        consumedAt: new Date().toISOString(),
      }))
    );

    // 4. Increment access count
    policy.accessCount = (policy.accessCount || 0) + 1;
    policy.updatedAt = new Date().toISOString();

    // Check if this access exhausts the policy
    if (
      policy.maxAccessCount > 0 &&
      policy.accessCount >= policy.maxAccessCount
    ) {
      policy.status = PolicyStatus.EXHAUSTED;
    }

    await this._putJSON(ctx, policyId, policy);

    // 5. Emit access-granted audit
    const txId = ctx.stub.getTxID();
    const audit = buildAuditEvent({
      auditId: `aud_${txId.substring(0, 16)}`,
      patientIdHash: policy.patientIdHash,
      providerId: providerIdStr,
      category: policy.allowedCategories,
      action: 'ACCESS_GRANTED',
      proofId,
      policyId,
      txId,
      timestamp: new Date().toISOString(),
    });
    await this._putJSON(ctx, audit.auditId, audit);
    emitAuditEvent(ctx, 'AccessGranted', audit);

    return JSON.stringify({
      accessGranted: true,
      authorizedCategories: policy.allowedCategories,
      auditRef: audit.auditId,
      txId,
    });
  }

  // ── 5. LogAuditEvent (internal) ───────────────────────────────────

  /**
   * Write a custom audit event to the ledger.
   * Used by the backend for non-proof events (e.g. record registration).
   */
  async LogAuditEvent(ctx, auditJSON) {
    const event = JSON.parse(auditJSON);
    if (!event.auditId) throw new Error('auditId is required');

    event.docType = 'auditEvent';
    event.timestamp = event.timestamp || new Date().toISOString();

    await this._putJSON(ctx, event.auditId, event);
    emitAuditEvent(ctx, event.action || 'AuditEvent', event);

    return JSON.stringify({ auditId: event.auditId });
  }

  // ── 6. QueryConsentPolicy ─────────────────────────────────────────

  /**
   * Read a single consent policy by ID.
   */
  async QueryConsentPolicy(ctx, policyId) {
    const policy = await this._getJSON(ctx, policyId);
    if (!policy) throw new Error(`Policy ${policyId} not found`);
    return JSON.stringify(policy);
  }

  // ── 7. QueryAuditTrail ────────────────────────────────────────────

  /**
   * Rich query on CouchDB for audit events.
   * Supports filtering by patientIdHash, providerId, action, date range.
   *
   * @param {Context} ctx
   * @param {string}  queryJSON — JSON with optional filters:
   *   { patientIdHash?, providerId?, action?, fromDate?, toDate?, limit? }
   */
  async QueryAuditTrail(ctx, queryJSON) {
    const filters = JSON.parse(queryJSON);
    const selector = { docType: 'auditEvent' };

    if (filters.patientIdHash) {
      selector.patientIdHash = filters.patientIdHash;
    }
    if (filters.providerId) {
      selector.providerId = filters.providerId;
    }
    if (filters.action) {
      selector.action = filters.action;
    }
    if (filters.fromDate || filters.toDate) {
      selector.timestamp = {};
      if (filters.fromDate) selector.timestamp.$gte = filters.fromDate;
      if (filters.toDate) selector.timestamp.$lte = filters.toDate;
    }

    const query = {
      selector,
      sort: [{ timestamp: 'desc' }],
      limit: filters.limit || 100,
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results = [];

    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value) {
        results.push(JSON.parse(res.value.value.toString()));
      }
      res = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify({ total: results.length, events: results });
  }

  // ── 8. GetProofStatus ─────────────────────────────────────────────

  /**
   * Check whether a proofId has already been consumed on the ledger.
   */
  async GetProofStatus(ctx, proofId) {
    const buf = await ctx.stub.getState(proofId);
    if (!buf || buf.length === 0) {
      return JSON.stringify({ proofId, status: 'UNUSED' });
    }
    const data = JSON.parse(buf.toString());
    return JSON.stringify({ proofId, status: data.status || 'CONSUMED' });
  }

  // ── Bonus: QueryPoliciesByPatient ─────────────────────────────────

  /**
   * Rich query: all consent policies for a given patient hash.
   * Useful for the patient dashboard.
   */
  async QueryPoliciesByPatient(ctx, patientIdHash) {
    const query = {
      selector: {
        docType: 'consentPolicy',
        patientIdHash,
      },
      sort: [{ createdAt: 'desc' }],
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results = [];

    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value) {
        results.push(JSON.parse(res.value.value.toString()));
      }
      res = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }
}

module.exports = AccessControlContract;
