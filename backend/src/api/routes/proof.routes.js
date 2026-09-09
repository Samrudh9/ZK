const { Router } = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
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
// Contract: patientId comes from the JWT, NOT the request body.

const generateProofSchema = z.object({
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

    // Fetch the consent policy to get the on-chain policyHash
    const policy = await consentService.getPolicy(data.consentPolicyId);
    if (!policy) {
      return res.status(404).json({
        error: { code: 'POLICY_NOT_FOUND', message: 'Consent policy not found', statusCode: 404 },
      });
    }

    // Uniform field-safe encoding: patientId from JWT, providerId from body.
    // The proof commits to Poseidon hashes over these tokens so the patient's
    // raw identity stays private while the on-chain patientIdHash matches.
    const patientIdField = proofService.toFieldId(req.user.userId);
    const providerIdField = proofService.toFieldId(data.providerId);
    const { patientIdHash, providerIdHash } = proofService.hashIds(patientIdField, providerIdField);

    // Bind the proof to THIS policy: full on-chain policyHash reduced to a
    // field token (mirrors the chaincode commitment, NOT a 16-char truncation).
    const policyHash = proofService.toFieldToken(policy.policyHash);

    const expiryTimestamp = Math.floor(new Date(data.expiry).getTime() / 1000);

    // Fresh nonce per proof → replay + freshness binding on-chain
    const nonce = proofService.toFieldToken(crypto.randomBytes(32).toString('hex'));

    const circuitInputs = {
      patientId: patientIdField,
      providerId: providerIdField,
      patientIdHash,
      providerIdHash,
      policyHash,
      expiry: expiryTimestamp.toString(),
      nonce,
    };

    // Generate proof
    const { proof, publicSignals, durationMs } = await proofService.generateProof(circuitInputs);

    const proofId = `prf_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const generatedAt = new Date().toISOString();

    // Store proof metadata in PostgreSQL. public_signals is the binding gate:
    // at verify time the submitted signals must match EXACTLY what was stored.
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

    // 1. Load the proof metadata FIRST — it is the binding gate. Without it the
    //    proof cannot be tied to a policy, so refuse before any crypto work.
    const { rows } = await query(
      'SELECT * FROM proof_metadata WHERE proof_id = $1',
      [data.proofId]
    );
    if (rows.length === 0) {
      return res.status(400).json({
        error: { code: 'PROOF_METADATA_MISSING', message: 'Cannot find policy for this proof', statusCode: 400 },
      });
    }
    const meta = rows[0];

    // 2. Authorization: only the provider the proof was generated for may redeem it.
    if (meta.provider_id !== req.user.userId) {
      return res.status(403).json({
        error: { code: 'PROOF_NOT_FOR_PROVIDER', message: 'This proof was not issued to this provider', statusCode: 403 },
      });
    }

    // 3. Off-chain freshness: proof expires when the requested expiry lapses.
    if (new Date(meta.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        error: { code: 'PROOF_EXPIRED', message: 'Proof has expired', statusCode: 400 },
      });
    }

    // 4. Verify the proof cryptographically (snarkjs).
    const { isValid, durationMs } = await proofService.verifyProof(data.proof, data.publicSignals);
    if (!isValid) {
      return res.status(400).json({
        error: { code: 'INVALID_PROOF', message: 'zk-SNARK verification failed', statusCode: 400 },
      });
    }

    // 5. Binding gate: the submitted public signals must match EXACTLY what was
    //    stored at generate time — the proof commits to this policy, this
    //    patient, this provider, this expiry, this nonce. public_signals is a
    //    jsonb column, so pg returns it as a parsed array.
    const storedSignals = meta.public_signals;
    const signalsMatch =
      Array.isArray(storedSignals) &&
      storedSignals.length === data.publicSignals.length &&
      storedSignals.every((v, i) => String(v) === String(data.publicSignals[i]));
    if (!signalsMatch) {
      return res.status(400).json({
        error: { code: 'SIGNAL_MISMATCH', message: 'Public signals do not match the issued proof', statusCode: 400 },
      });
    }

    // 6. Defense in depth: re-derive the policyHash from the ledger and confirm
    //    the proof commits to it (full token, matching the chaincode commitment).
    const policy = await consentService.getPolicy(meta.policy_id);
    if (!policy) {
      return res.status(404).json({
        error: { code: 'POLICY_NOT_FOUND', message: 'Consent policy not found', statusCode: 404 },
      });
    }
    if (proofService.toFieldToken(policy.policyHash) !== data.publicSignals[3]) {
      return res.status(400).json({
        error: { code: 'POLICY_HASH_MISMATCH', message: 'Proof is not bound to the current consent policy', statusCode: 400 },
      });
    }

    // 7. Submit to chaincode for stateful checks (replay, policy active, expiry
    //    budget). Runs as the PROVIDER org (Org2MSP) identity.
    const chaincodeResult = await fabric.submitTransaction(
      'VerifyAndGrantAccess',
      data.proofId,
      meta.policy_id,
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
