'use strict';

const crypto = require('crypto');
const { PolicyStatus } = require('./constants');

/**
 * Validate that all required consent-policy fields are present and sane.
 * Throws descriptive errors on invalid input.
 */
function validatePolicyParams(params) {
  const required = [
    'policyId',
    'patientIdHash',
    'providerId',
    'allowedCategories',
    'validFrom',
    'validUntil',
  ];
  for (const field of required) {
    if (!params[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (
    !Array.isArray(params.allowedCategories) ||
    params.allowedCategories.length === 0
  ) {
    throw new Error('allowedCategories must be a non-empty array');
  }

  const from = new Date(params.validFrom);
  const until = new Date(params.validUntil);
  if (isNaN(from.getTime()) || isNaN(until.getTime())) {
    throw new Error('validFrom and validUntil must be valid ISO-8601 dates');
  }
  if (until <= from) {
    throw new Error('validUntil must be after validFrom');
  }

  if (
    params.maxAccessCount !== undefined &&
    params.maxAccessCount !== null
  ) {
    const max = Number(params.maxAccessCount);
    if (!Number.isInteger(max) || max < 1) {
      throw new Error('maxAccessCount must be a positive integer');
    }
  }
}

/**
 * Compute a deterministic SHA-256 hash of the policy parameters.
 * Used as the on-chain commitment that the zk circuit binds to.
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

/**
 * Determine the effective status of a policy at a given point in time.
 * Returns the status string and whether the policy is usable for access.
 */
function isPolicyActive(policy, nowISO) {
  // Explicit revocation takes precedence
  if (policy.status === PolicyStatus.REVOKED) {
    return { status: PolicyStatus.REVOKED, active: false };
  }

  const now = nowISO ? new Date(nowISO) : new Date();

  // Expiry check
  if (now > new Date(policy.validUntil)) {
    return { status: PolicyStatus.EXPIRED, active: false };
  }

  // Not yet valid
  if (now < new Date(policy.validFrom)) {
    return { status: PolicyStatus.ACTIVE, active: false };
  }

  // Exhaustion check
  if (
    policy.maxAccessCount &&
    policy.maxAccessCount > 0 &&
    policy.accessCount >= policy.maxAccessCount
  ) {
    return { status: PolicyStatus.EXHAUSTED, active: false };
  }

  return { status: PolicyStatus.ACTIVE, active: true };
}

module.exports = { validatePolicyParams, computePolicyHash, isPolicyActive };
