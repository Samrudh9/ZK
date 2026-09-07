'use strict';

const {
  validatePolicyParams,
  computePolicyHash,
  isPolicyActive,
} = require('../lib/consentManager');
const { PolicyStatus } = require('../lib/constants');

function validPolicy(overrides = {}) {
  return {
    policyId: 'pol_001',
    patientIdHash: 'a'.repeat(64),
    providerId: 'prov-dr-smith',
    allowedCategories: ['LAB', 'RADIOLOGY'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    purpose: 'treatment',
    ...overrides,
  };
}

describe('consentManager', () => {
  describe('validatePolicyParams', () => {
    test('accepts a valid policy', () => {
      expect(() => validatePolicyParams(validPolicy())).not.toThrow();
    });

    test.each([
      ['policyId'],
      ['patientIdHash'],
      ['providerId'],
      ['allowedCategories'],
      ['validFrom'],
      ['validUntil'],
    ])('rejects missing %s', (field) => {
      const p = validPolicy();
      delete p[field];
      expect(() => validatePolicyParams(p)).toThrow(`Missing required field: ${field}`);
    });

    test('rejects empty allowedCategories', () => {
      const p = validPolicy({ allowedCategories: [] });
      expect(() => validatePolicyParams(p)).toThrow('non-empty array');
    });

    test('rejects invalid dates', () => {
      const p = validPolicy({ validFrom: 'not-a-date' });
      expect(() => validatePolicyParams(p)).toThrow('valid ISO-8601');
    });

    test('rejects validUntil before validFrom', () => {
      const p = validPolicy({
        validFrom: '2027-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
      });
      expect(() => validatePolicyParams(p)).toThrow('validUntil must be after validFrom');
    });

    test('rejects non-positive maxAccessCount', () => {
      const p = validPolicy({ maxAccessCount: 0 });
      p.maxAccessCount = 0;
      expect(() => validatePolicyParams(p)).toThrow('positive integer');
    });
  });

  describe('computePolicyHash', () => {
    test('is deterministic and 64-hex', () => {
      const p = validPolicy();
      const h1 = computePolicyHash(p);
      const h2 = computePolicyHash(validPolicy());
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    test('changes when a category changes', () => {
      const a = computePolicyHash(validPolicy());
      const b = computePolicyHash(validPolicy({ allowedCategories: ['LAB'] }));
      expect(a).not.toBe(b);
    });

    test('is order-insensitive across categories', () => {
      const a = computePolicyHash(validPolicy({
        allowedCategories: ['LAB', 'RADIOLOGY'],
      }));
      const b = computePolicyHash(validPolicy({
        allowedCategories: ['RADIOLOGY', 'LAB'],
      }));
      expect(a).toBe(b);
    });
  });

  describe('isPolicyActive', () => {
    const policy = {
      status: PolicyStatus.ACTIVE,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      maxAccessCount: 2,
      accessCount: 0,
    };

    test('active within validity window', () => {
      const { status, active } = isPolicyActive(policy, '2026-06-01T00:00:00.000Z');
      expect(status).toBe(PolicyStatus.ACTIVE);
      expect(active).toBe(true);
    });

    test('expired after validUntil', () => {
      const { status, active } = isPolicyActive(policy, '2028-01-01T00:00:00.000Z');
      expect(status).toBe(PolicyStatus.EXPIRED);
      expect(active).toBe(false);
    });

    test('revoked always wins', () => {
      const revoked = { ...policy, status: PolicyStatus.REVOKED };
      const { status, active } = isPolicyActive(revoked, '2026-06-01T00:00:00.000Z');
      expect(status).toBe(PolicyStatus.REVOKED);
      expect(active).toBe(false);
    });

    test('exhausted once accessCount reaches max', () => {
      const exhausted = { ...policy, accessCount: 2 };
      const { status, active } = isPolicyActive(exhausted, '2026-06-01T00:00:00.000Z');
      expect(status).toBe(PolicyStatus.EXHAUSTED);
      expect(active).toBe(false);
    });

    test('unlimited policy (maxAccessCount 0) never exhausts', () => {
      const unlimited = { ...policy, maxAccessCount: 0, accessCount: 99 };
      const { active } = isPolicyActive(unlimited, '2026-06-01T00:00:00.000Z');
      expect(active).toBe(true);
    });
  });
});