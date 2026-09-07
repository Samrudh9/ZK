'use strict';

const { buildAuditEvent, emitAuditEvent } = require('./auditLogger');
const {
  validatePolicyParams,
  computePolicyHash,
  isPolicyActive,
} = require('./consentManager');

/**
 * Consent policy states (terminal states cannot transition out).
 */
const PolicyStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  EXHAUSTED: 'EXHAUSTED',
};

/**
 * Key prefixes for composite keys in the world state.
 */
const KEY = {
  POLICY: 'policy',
  PROOF: 'proof',
  AUDIT: 'audit',
  RECORD: 'record',
};

module.exports = { PolicyStatus, KEY };
