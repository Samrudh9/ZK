const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const consentService = require('../../services/consent.service');
const proofService = require('../../services/proof.service');

const router = Router();

// All consent routes require authentication as PATIENT
router.use(authMiddleware);

// ── Validation schemas ──────────────────────────────────────────────

const createConsentSchema = z.object({
  providerId: z.string().min(1),
  allowedCategories: z.array(z.string().min(1)).min(1),
  purpose: z.string().optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  maxAccessCount: z.number().int().positive().optional(),
});

const updateConsentSchema = z.object({
  allowedCategories: z.array(z.string().min(1)).min(1).optional(),
  validUntil: z.string().datetime().optional(),
  maxAccessCount: z.number().int().nonnegative().optional(),
  purpose: z.string().optional(),
});

// ── GET /consent ────────────────────────────────────────────────────

router.get('/', requireRole('PATIENT'), async (req, res, next) => {
  try {
    // Use the patient's ID hash to query their policies (uniform field-safe encoding)
    const { patientIdHash } = proofService.hashIds(proofService.toFieldId(req.user.userId), 0);
    const policies = await consentService.getPoliciesByPatient(patientIdHash);
    res.json(policies || []);
  } catch (err) {
    next(err);
  }
});

// ── POST /consent ───────────────────────────────────────────────────

router.post('/', requireRole('PATIENT'), async (req, res, next) => {
  try {
    const data = createConsentSchema.parse(req.body);
    const { patientIdHash } = proofService.hashIds(proofService.toFieldId(req.user.userId), 0);

    const result = await consentService.createPolicy({
      patientIdHash,
      providerId: data.providerId,
      allowedCategories: data.allowedCategories,
      purpose: data.purpose,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      maxAccessCount: data.maxAccessCount,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ── PUT /consent/:policyId ──────────────────────────────────────────

router.put('/:policyId', requireRole('PATIENT'), async (req, res, next) => {
  try {
    const data = updateConsentSchema.parse(req.body);
    const result = await consentService.updatePolicy(req.params.policyId, data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /consent/:policyId ───────────────────────────────────────

router.delete('/:policyId', requireRole('PATIENT'), async (req, res, next) => {
  try {
    const result = await consentService.revokePolicy(req.params.policyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /consent/:policyId/access-log ───────────────────────────────

router.get('/:policyId/access-log', requireRole('PATIENT'), async (req, res, next) => {
  try {
    const { default: auditService } = await import('../../services/audit.service.js');
    const result = await require('../../services/audit.service').queryAuditTrail({
      policyId: req.params.policyId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
