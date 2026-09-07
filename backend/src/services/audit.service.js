const fabric = require('./fabric.service');
const { query } = require('../db/pool');
const logger = require('../config/logger');

/**
 * Query audit trail from Fabric ledger with optional filters.
 */
async function queryAuditTrail(filters = {}) {
  const result = await fabric.evaluateTransaction(
    'QueryAuditTrail',
    JSON.stringify(filters)
  );
  return result;
}

/**
 * Get a single audit event by ID.
 */
async function getAuditEvent(auditId) {
  // Try Fabric first
  try {
    const result = await fabric.evaluateTransaction('QueryConsentPolicy', auditId);
    // If it's an audit event (docType check)
    if (result && result.docType === 'auditEvent') {
      // Enrich from PostgreSQL
      const enrichment = await getEnrichment(auditId);
      return { ...result, ...enrichment };
    }
    return result;
  } catch {
    // Fallback: try from enrichment table
    const { rows } = await query(
      'SELECT * FROM audit_enrichment WHERE audit_id = $1',
      [auditId]
    );
    if (rows.length > 0) return rows[0];
    throw new Error(`Audit event ${auditId} not found`);
  }
}

/**
 * Get enrichment data (display names, labels) from PostgreSQL.
 */
async function getEnrichment(auditId) {
  const { rows } = await query(
    'SELECT * FROM audit_enrichment WHERE audit_id = $1',
    [auditId]
  );
  return rows.length > 0 ? rows[0] : {};
}

/**
 * Store enrichment data for an audit event in PostgreSQL.
 */
async function storeEnrichment({ auditId, providerName, categoryLabels, notes, fabricTxId, fabricBlockNum }) {
  await query(
    `INSERT INTO audit_enrichment (audit_id, provider_name, category_labels, notes, fabric_tx_id, fabric_block_num)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (audit_id) DO UPDATE SET
       provider_name = EXCLUDED.provider_name,
       category_labels = EXCLUDED.category_labels,
       notes = EXCLUDED.notes`,
    [auditId, providerName, categoryLabels, notes, fabricTxId, fabricBlockNum]
  );
}

/**
 * Export audit trail as CSV string.
 */
async function exportAuditCSV(filters = {}) {
  const { events } = await queryAuditTrail(filters);

  if (!events || events.length === 0) {
    return 'No audit events found';
  }

  const headers = [
    'auditId', 'timestamp', 'patientIdHash', 'providerId',
    'category', 'action', 'proofId', 'policyId', 'txId',
  ];
  const csvLines = [headers.join(',')];

  for (const event of events) {
    const row = headers.map((h) => {
      const val = event[h];
      if (Array.isArray(val)) return `"${val.join(';')}"`;
      return val ? `"${String(val).replace(/"/g, '""')}"` : '';
    });
    csvLines.push(row.join(','));
  }

  return csvLines.join('\n');
}

module.exports = {
  queryAuditTrail,
  getAuditEvent,
  storeEnrichment,
  exportAuditCSV,
};
