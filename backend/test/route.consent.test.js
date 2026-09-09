const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

// Mock dependencies before importing app
const mockQuery = jest.fn();
jest.mock('../src/db/pool', () => ({ query: (...a) => mockQuery(...a) }));

jest.mock('../src/services/fabric.service', () => ({
  submitTransaction: jest.fn(),
  evaluateTransaction: jest.fn(),
}));

const app = require('../src/app');
const fabric = require('../src/services/fabric.service');
const { toFieldId, hashIds } = require('../src/services/proof.service');

const PATIENT_TOKEN = jwt.sign(
  { id: 'u1', userId: 'alice', role: 'PATIENT', walletId: 'w1', orgId: 'Org1MSP' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);
const AUTH = { Authorization: `Bearer ${PATIENT_TOKEN}` };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('POST /v1/consent', () => {
  test('valid create → 201 with on-chain policyId', async () => {
    fabric.submitTransaction.mockResolvedValueOnce({
      policyId: 'cp_test123', status: 'ACTIVE',
      policyHash: 'a'.repeat(64), patientIdHash: '12345', createdAt: new Date().toISOString(),
    });

    const { body, status } = await request(app)
      .post('/v1/consent')
      .set(AUTH)
      .send({
        providerId: 'drbob',
        allowedCategories: ['LAB'],
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2030-01-01T00:00:00.000Z',
      });

    expect(status).toBe(201);
    expect(body.policyId).toBe('cp_test123');
    expect(fabric.submitTransaction).toHaveBeenCalledWith(
      'CreateConsentPolicy',
      expect.any(String)
    );

    // Verify the patientIdHash passed to chaincode matches our encoding
    const payload = JSON.parse(fabric.submitTransaction.mock.calls[0][1]);
    const { patientIdHash } = hashIds(toFieldId('alice'), 0);
    expect(payload.patientIdHash).toBe(patientIdHash);
  });

  test('missing providerId → 400 VALIDATION', async () => {
    const { status } = await request(app)
      .post('/v1/consent')
      .set(AUTH)
      .send({ allowedCategories: ['LAB'], validFrom: '2025-01-01T00:00:00.000Z', validUntil: '2030-01-01T00:00:00.000Z' });
    expect(status).toBe(400);
  });
});

describe('GET /v1/consent', () => {
  test('returns policies for the authenticated patient', async () => {
    const { patientIdHash } = hashIds(toFieldId('alice'), 0);
    const policy = { policyId: 'cp_abc', patientIdHash, status: 'ACTIVE' };

    fabric.evaluateTransaction.mockResolvedValueOnce([policy]);

    const { body, status } = await request(app)
      .get('/v1/consent')
      .set(AUTH);

    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].policyId).toBe('cp_abc');
    expect(fabric.evaluateTransaction).toHaveBeenCalledWith('QueryPoliciesByPatient', patientIdHash);
  });
});

describe('DELETE /v1/consent/:policyId', () => {
  test('revoke → 200', async () => {
    fabric.submitTransaction.mockResolvedValueOnce({ policyId: 'cp_abc', status: 'REVOKED' });
    const { status } = await request(app)
      .delete('/v1/consent/cp_abc')
      .set(AUTH);
    expect(status).toBe(200);
    expect(fabric.submitTransaction).toHaveBeenCalledWith('RevokeConsentPolicy', 'cp_abc');
  });
});
