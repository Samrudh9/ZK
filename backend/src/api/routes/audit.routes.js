const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const auditService = require('../../services/audit.service');

const router = Router();

router.use(authMiddleware);

// ── Validation schemas ──────────────────────────────────────────────

const queryAuditSchema = z.object({
  patientIdHash: z.string().optional(),
  providerId: z.string().optional(),
  action: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

const enrichAuditSchema = z.object({
  providerName: z.string().optional(),
  categoryLabels: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

// ── GET /audit ──────────────────────────────────────────────────────

router.get('/', requireRole('PATIENT', 'ADMIN', 'PROVIDER'), async (req, res, next) => {
  try {
    const query = queryAuditSchema.parse(req.query);
    const result = await auditService.queryAuditTrail(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /audit/export ───────────────────────────────────────────────

router.get('/export', requireRole('PATIENT', 'ADMIN'), async (req, res, next) => {
  try {
    const query = queryAuditSchema.parse(req.query);
    const csv = await auditService.exportAuditCSV(query);
    
    res.header('Content-Type', 'text/csv');
    res.attachment(`audit_export_${new Date().toISOString()}.csv`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── GET /audit/:auditId ─────────────────────────────────────────────

router.get('/:auditId', requireRole('PATIENT', 'ADMIN', 'PROVIDER'), async (req, res, next) => {
  try {
    const event = await auditService.getAuditEvent(req.params.auditId);
    if (!event) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audit event not found', statusCode: 404 }
      });
    }
    res.json(event);
  } catch (err) {
    next(err);
  }
});

// ── POST /audit/:auditId/enrich ─────────────────────────────────────

router.post('/:auditId/enrich', requireRole('ADMIN', 'PROVIDER'), async (req, res, next) => {
  try {
    const data = enrichAuditSchema.parse(req.body);
    await auditService.storeEnrichment({
      auditId: req.params.auditId,
      providerName: data.providerName,
      categoryLabels: data.categoryLabels,
      notes: data.notes,
    });
    res.json({ message: 'Audit event enriched' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
