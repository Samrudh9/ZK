'use strict';

/**
 * Build an audit event object for the ledger.
 * No raw patient identity is stored — only the Poseidon hash.
 */
function buildAuditEvent({
  auditId,
  patientIdHash,
  providerId,
  category,
  action,
  proofId,
  policyId,
  txId,
  timestamp,
}) {
  return {
    docType: 'auditEvent',
    auditId,
    patientIdHash,
    providerId,
    category: Array.isArray(category) ? category : [category],
    action, // ACCESS_GRANTED | ACCESS_DENIED | CONSENT_CREATED | CONSENT_REVOKED
    proofId: proofId || '',
    policyId: policyId || '',
    txId,
    timestamp,
  };
}

/**
 * Emit a Fabric chaincode event so listeners (backend) can react in real-time.
 * The event name is the action (e.g. "AccessGranted"), and the payload is the
 * audit event JSON.
 */
function emitAuditEvent(ctx, eventName, auditEvent) {
  ctx.stub.setEvent(eventName, Buffer.from(JSON.stringify(auditEvent)));
}

module.exports = { buildAuditEvent, emitAuditEvent };
