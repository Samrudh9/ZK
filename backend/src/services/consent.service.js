const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fabric = require('./fabric.service');
const logger = require('../config/logger');

/**
 * Create a consent policy on the Fabric ledger.
 */
async function createPolicy({ patientIdHash, providerId, allowedCategories, purpose, validFrom, validUntil, maxAccessCount }) {
  const policyId = `cp_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

  const policyParams = {
    policyId,
    patientIdHash,
    providerId,
    allowedCategories,
    purpose: purpose || '',
    validFrom,
    validUntil,
    maxAccessCount: maxAccessCount || 0,
  };

  const result = await fabric.submitTransaction(
    'CreateConsentPolicy',
    JSON.stringify(policyParams)
  );

  logger.info('Consent policy created', { policyId, providerId });
  return result;
}

/**
 * Update an existing consent policy.
 */
async function updatePolicy(policyId, updates) {
  const result = await fabric.submitTransaction(
    'UpdateConsentPolicy',
    policyId,
    JSON.stringify(updates)
  );

  logger.info('Consent policy updated', { policyId });
  return result;
}

/**
 * Revoke a consent policy.
 */
async function revokePolicy(policyId) {
  const result = await fabric.submitTransaction(
    'RevokeConsentPolicy',
    policyId
  );

  logger.info('Consent policy revoked', { policyId });
  return result;
}

/**
 * Query a single consent policy by ID.
 */
async function getPolicy(policyId) {
  return fabric.evaluateTransaction('QueryConsentPolicy', policyId);
}

/**
 * Query all consent policies for a patient.
 */
async function getPoliciesByPatient(patientIdHash) {
  return fabric.evaluateTransaction('QueryPoliciesByPatient', patientIdHash);
}

/**
 * Compute SHA-256 hash of policy parameters (same algorithm as chaincode).
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

module.exports = {
  createPolicy,
  updatePolicy,
  revokePolicy,
  getPolicy,
  getPoliciesByPatient,
  computePolicyHash,
};
