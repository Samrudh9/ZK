'use strict';

const AccessControlContract = require('../lib/accessControl');
const { MockContext } = require('./mockContext');
const { PolicyStatus } = require('../lib/constants');

const PATIENT_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROVIDER = 'prov-dr-smith';

function validPolicyJSON(overrides = {}) {
  return JSON.stringify({
    policyId: 'pol_001',
    patientIdHash: PATIENT_HASH,
    providerId: PROVIDER,
    allowedCategories: ['LAB', 'RADIOLOGY'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2030-01-01T00:00:00.000Z',
    purpose: 'treatment',
    ...overrides,
  });
}

describe('AccessControlContract', () => {
  let contract;
  let ctx;

  beforeEach(() => {
    contract = new AccessControlContract();
    ctx = new MockContext({ mspId: 'Org1MSP' });
  });

  const asProvider = () => {
    ctx.mspId = 'Org2MSP';
  };

  async function createPolicy(overrides = {}, context = ctx) {
    return JSON.parse(
      await contract.CreateConsentPolicy(context, validPolicyJSON(overrides))
    );
  }

  const auditEvents = () =>
    [...ctx.state.keys()]
      .filter((k) => k.startsWith('aud_'))
      .map((k) => JSON.parse(ctx.state.get(k)));

  describe('CreateConsentPolicy', () => {
    test('creates an ACTIVE policy and returns its hash', async () => {
      const res = await createPolicy();
      expect(res.status).toBe(PolicyStatus.ACTIVE);
      expect(res.policyHash).toMatch(/^[0-9a-f]{64}$/);

      const stored = JSON.parse(await contract.QueryConsentPolicy(ctx, 'pol_001'));
      expect(stored.docType).toBe('consentPolicy');
      expect(stored.patientIdHash).toBe(PATIENT_HASH);
      expect(stored.accessCount).toBe(0);
    });

    test('rejects duplicate policyId', async () => {
      await createPolicy();
      await expect(
        contract.CreateConsentPolicy(ctx, validPolicyJSON())
      ).rejects.toThrow('already exists');
    });

    test('rejects callers from Org2MSP (providers)', async () => {
      asProvider();
      await expect(
        contract.CreateConsentPolicy(ctx, validPolicyJSON())
      ).rejects.toThrow('requires Org1MSP');
    });

    test('rejects malformed policy JSON', async () => {
      await expect(
        contract.CreateConsentPolicy(ctx, '{not json')
      ).rejects.toThrow();
    });

    test('writes a CONSENT_CREATED audit event with no raw identity', async () => {
      await createPolicy();
      const events = auditEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('CONSENT_CREATED');
      expect(events[0].providerId).toBe(PROVIDER);
      // Privacy invariant: only the Poseidon hash on the ledger
      expect(events[0].patientIdHash).toBe(PATIENT_HASH);
    });

    test('emits a Fabric contract event with the audit payload', async () => {
      await createPolicy();
      expect(ctx.events.some((e) => e.name === 'ConsentCreated')).toBe(true);
    });
  });

  describe('UpdateConsentPolicy', () => {
    test('updates allowedCategories and recomputes hash', async () => {
      const before = await createPolicy();
      const updated = JSON.parse(
        await contract.UpdateConsentPolicy(ctx, 'pol_001',
          JSON.stringify({ allowedCategories: ['LAB'] }))
      );
      expect(updated.policyHash).not.toBe(before.policyHash);
      expect(updated.status).toBe(PolicyStatus.ACTIVE);

      const stored = JSON.parse(await contract.QueryConsentPolicy(ctx, 'pol_001'));
      expect(stored.allowedCategories).toEqual(['LAB']);
    });

    test('rejects empty categories update', async () => {
      await createPolicy();
      await expect(
        contract.UpdateConsentPolicy(ctx, 'pol_001',
          JSON.stringify({ allowedCategories: [] }))
      ).rejects.toThrow('non-empty array');
    });

    test('rejects updates to a missing policy', async () => {
      await expect(
        contract.UpdateConsentPolicy(ctx, 'nope',
          JSON.stringify({ allowedCategories: ['LAB'] }))
      ).rejects.toThrow('not found');
    });

    test('rejects invalid maxAccessCount', async () => {
      await createPolicy();
      await expect(
        contract.UpdateConsentPolicy(ctx, 'pol_001',
          JSON.stringify({ maxAccessCount: -1 }))
      ).rejects.toThrow('non-negative integer');
    });
  });

  describe('RevokeConsentPolicy', () => {
    test('revokes an active policy irreversibly', async () => {
      await createPolicy();
      const res = JSON.parse(await contract.RevokeConsentPolicy(ctx, 'pol_001'));
      expect(res.status).toBe(PolicyStatus.REVOKED);

      const stored = JSON.parse(await contract.QueryConsentPolicy(ctx, 'pol_001'));
      expect(stored.status).toBe(PolicyStatus.REVOKED);
      expect(stored.revokedAt).toBeDefined();
    });

    test('rejects double revocation', async () => {
      await createPolicy();
      await contract.RevokeConsentPolicy(ctx, 'pol_001');
      await expect(contract.RevokeConsentPolicy(ctx, 'pol_001'))
        .rejects.toThrow('already revoked');
    });

    test('rejects revocation of a missing policy', async () => {
      await expect(contract.RevokeConsentPolicy(ctx, 'nope'))
        .rejects.toThrow('not found');
    });
  });

  describe('VerifyAndGrantAccess', () => {
    const grant = (policyId = 'pol_001', provider = PROVIDER, proofId = 'proof_1') =>
      contract.VerifyAndGrantAccess(ctx, proofId, policyId, provider);

    test('grants access and marks proof consumed', async () => {
      await createPolicy();
      asProvider();
      const res = JSON.parse(await grant());
      expect(res.accessGranted).toBe(true);
      expect(res.authorizedCategories).toEqual(['LAB', 'RADIOLOGY']);

      const proof = JSON.parse(await contract.GetProofStatus(ctx, 'proof_1'));
      expect(proof.status).toBe('CONSUMED');
    });

    test('prevents proof replay (single-use proofs)', async () => {
      await createPolicy();
      asProvider();
      await grant();
      await expect(grant()).rejects.toThrow('PROOF_REPLAYED');
    });

    test('rejects missing policy', async () => {
      asProvider();
      await expect(grant('no_such_policy')).rejects.toThrow('POLICY_NOT_FOUND');
    });

    test('denies access against a revoked policy', async () => {
      await createPolicy();
      await contract.RevokeConsentPolicy(ctx, 'pol_001');
      asProvider();
      await expect(grant()).rejects.toThrow('POLICY_INACTIVE');
    });

    test('denies access once policy is exhausted', async () => {
      await createPolicy({ maxAccessCount: 1 });
      asProvider();
      await grant('pol_001', PROVIDER, 'proof_a');
      await expect(grant('pol_001', PROVIDER, 'proof_b'))
        .rejects.toThrow('POLICY_INACTIVE');

      const stored = JSON.parse(await contract.QueryConsentPolicy(ctx, 'pol_001'));
      expect(stored.status).toBe(PolicyStatus.EXHAUSTED);
    });

    test('encodes every granted access in the audit trail', async () => {
      await createPolicy();
      asProvider();
      await grant();
      const granted = auditEvents().find((a) => a.action === 'ACCESS_GRANTED');
      expect(granted).toBeDefined();
      expect(granted.proofId).toBe('proof_1');
      expect(granted.policyId).toBe('pol_001');
    });

    test('requires a provider (Org2MSP) caller', async () => {
      await createPolicy();
      await expect(grant()).rejects.toThrow('requires Org2MSP');
    });
  });

  describe('LogAuditEvent & GetProofStatus', () => {
    test('writes a custom audit event and emits contract event', async () => {
      asProvider();
      const res = JSON.parse(await contract.LogAuditEvent(ctx, JSON.stringify({
        auditId: 'aud_custom',
        action: 'RECORD_VIEWED',
        patientIdHash: PATIENT_HASH,
        providerId: PROVIDER,
      })));
      expect(res.auditId).toBe('aud_custom');
      expect(ctx.events.some((e) => e.name === 'RECORD_VIEWED')).toBe(true);
    });

    test('returns UNUSED for a fresh proofId', async () => {
      const res = JSON.parse(await contract.GetProofStatus(ctx, 'proof_never_used'));
      expect(res.status).toBe('UNUSED');
    });
  });
});