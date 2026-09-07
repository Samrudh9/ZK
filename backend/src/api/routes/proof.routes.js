const { Router } = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const { proofLimiter } = require('../middleware/rateLimiter');
const proofService = require('../../services/proof.service');
const consentService = require('../../services/consent.service');
const fabric = require('../../services/fabric.service');
const { query } = require('../../db/pool');
const logger = require('../../config/logger');

const router = Router();

router.use(authMiddleware);

// ── Validation schemas ──────────────────────────────────────────────

const generateProofSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  recordCategories: z.array(z.string()).min(1),
  consentPolicyId: z.string().min(1),
  expiry: z.string().datetime(),
});

const verifyProofSchema = z.object({
  proofId: z.string().min(1),
  proof: z.object({
    pi_a: z.array(z.string()),
    pi_b: z.array(z.array(z.string())),
    pi_c: z.array(z.string()),
    protocol: z.string(),
    curve: z.string().optional(),
  }),
  publicSignals: z.array(z.string()),
});

// ── POST /proof/generate ────────────────────────────────────────────

router.post('/generate', requireRole('PATIENT'), proofLimiter, async (req, res, next) => {
  try {
    const data = generateProofSchema.parse(req.body);

    // Fetch the consent policy to get the policyHash
    const policy = await consentService.getPolicy(data.consentPolicyId);
    if (!policy) {
      return res.status(404).json({
        error: { code: 'POLICY_NOT_FOUND', message: 'Consent policy not found', statusCode: 404 },
      });
    }

    // Compute Poseidon hashes for circuit inputs
    const patientIdNum = BigInt('0x' + Buffer.from(data.patientId).toString('hex').substring(0, 16));
    const providerIdNum = BigInt('0x' + Buffer.from(data.providerId).toString('hex').substring(0, 16));
    const { patientIdHash, providerIdHash } = proofService.hashIds(patientIdNum, providerIdNum);

    // Build circuit inputs
    const nonce = BigInt('0x' + uuidv4().replace(/-/g, '').substring(0, 16));
    const expiryTimestamp = Math.floor(new Date(data.expiry).getTime() / 1000);
    const policyHashNum = BigInt('0x' + policy.policyHash.substring(0, 16));

    const circuitInputs = {
      patientId: patientIdNum.toString(),
      providerId: providerIdNum.toString(),
      patientIdHash,
      providerIdHash,
      policyHash: policyHashNum.toString(),
      expiry: expiryTimestamp.toString(),
      nonce: nonce.toString(),
    };

    // Generate proof
    const { proof, publicSignals, durationMs } = await proofService.generateProof(circuitInputs);

    const proofId = `prf_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const generatedAt = new Date().toISOString();

    // Store proof metadata in PostgreSQL
    try {
      await query(
        `INSERT INTO proof_metadata (proof_id, patient_id, provider_id, policy_id, status, proof_json, public_signals, generated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [proofId, req.user.id, data.providerId, data.consentPolicyId, 'GENERATED',
         JSON.stringify(proof), JSON.stringify(publicSignals), generatedAt, data.expiry]
      );
    } catch (dbErr) {
      logger.warn('Failed to store proof metadata (non-fatal)', { error: dbErr.message });
    }

    logger.info('Proof generated', { proofId, durationMs });

    res.json({
      proofId,
      proof,
      publicSignals,
      generatedAt,
      expiresAt: data.expiry,
      durationMs,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /proof/verify ──────────────────────────────────────────────

router.post('/verify', requireRole('PROVIDER'), async (req, res, next) => {
  try {
    const data = verifyProofSchema.parse(req.body);

    // 1. Verify the proof cryptographically (snarkjs)
    const { isValid, durationMs } = await proofService.verifyProof(data.proof, data.publicSignals);

    if (!isValid) {
      return res.status(400).json({
        error: { code: 'INVALID_PROOF', message: 'zk-SNARK verification failed', statusCode: 400 },
      });
    }

    // 2. Submit to chaincode for stateful checks (replay, policy, expiry)
    // Look up the policyId from proof metadata
    let policyId = null;
    try {
      const { rows } = await query(
        'SELECT policy_id FROM proof_metadata WHERE proof_id = $1',
        [data.proofId]
      );
      if (rows.length > 0) policyId = rows[0].policy_id;
    } catch (dbErr) {
      logger.warn('Failed to look up proof metadata (non-fatal)', { error: dbErr.message });
    }

    if (!policyId) {
      // Try extracting from publicSignals if metadata unavailable
      return res.status(400).json({
        error: { code: 'PROOF_METADATA_MISSING', message: 'Cannot find policy for this proof', statusCode: 400 },
      });
    }

    const chaincodeResult = await fabric.submitTransaction(
      'VerifyAndGrantAccess',
      data.proofId,
      policyId,
      req.user.userId
    );

    // Update proof metadata
    try {
      await query(
        `UPDATE proof_metadata SET status = 'VERIFIED', verified_at = NOW(), fabric_tx_id = $2 WHERE proof_id = $1`,
        [data.proofId, chaincodeResult.txId || '']
      );
    } catch (dbErr) {
      logger.warn('Failed to update proof metadata (non-fatal)', { error: dbErr.message });
    }

    logger.info('Proof verified', { proofId: data.proofId, accessGranted: true, verifyMs: durationMs });

    res.json({
      valid: true,
      accessGranted: chaincodeResult.accessGranted,
      authorizedCategories: chaincodeResult.authorizedCategories,
      txId: chaincodeResult.txId,
      auditRef: chaincodeResult.auditRef,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /proof/:proofId ─────────────────────────────────────────────

router.get('/:proofId', async (req, res, next) => {
  try {
    // Check local metadata first
    const { rows } = await query(
      'SELECT * FROM proof_metadata WHERE proof_id = $1',
      [req.params.proofId]
    );

    if (rows.length === 0) {
      // Check on-chain status
      const onChain = await fabric.evaluateTransaction(
        'GetProofStatus',
        req.params.proofId
      );
      return res.json(onChain);
    }

    const meta = rows[0];
    res.json({
      proofId: meta.proof_id,
      status: meta.status,
      generatedAt: meta.generated_at,
      expiresAt: meta.expires_at,
      verifiedAt: meta.verified_at,
      fabricTxId: meta.fabric_tx_id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
