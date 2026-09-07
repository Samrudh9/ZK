const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const fabric = require('../../services/fabric.service');

const router = Router();

router.use(authMiddleware);

// ── Validation schemas ──────────────────────────────────────────────

const registerRecordSchema = z.object({
  recordId: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
});

// ── GET /records ────────────────────────────────────────────────────

router.get('/', requireRole('PATIENT', 'PROVIDER'), async (req, res, next) => {
  try {
    // In a real system, this would query an off-chain EHR database.
    // For the ZK demo, we just return a mocked list.
    res.json([
      { recordId: 'rec_1', category: 'CARDIOLOGY', description: 'ECG Results' },
      { recordId: 'rec_2', category: 'GENERAL', description: 'Annual Checkup' },
    ]);
  } catch (err) {
    next(err);
  }
});

// ── POST /records/register ──────────────────────────────────────────

router.post('/register', requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const data = registerRecordSchema.parse(req.body);

    // Write an audit event to the ledger to prove the record exists
    const auditEvent = {
      auditId: `rec_${Date.now()}`,
      patientIdHash: 'N/A', // Omitted for privacy
      providerId: req.user.userId,
      category: [data.category],
      action: 'RECORD_REGISTERED',
      policyId: '',
      proofId: '',
      timestamp: new Date().toISOString(),
    };

    const result = await fabric.submitTransaction(
      'LogAuditEvent',
      JSON.stringify(auditEvent)
    );

    res.status(201).json({
      message: 'Record registered on-chain',
      recordId: data.recordId,
      auditId: auditEvent.auditId,
      txId: result?.txId,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
