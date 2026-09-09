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

jest.mock('../src/services/consent.service', () => ({
  getPolicy: jest.fn(),
  createPolicy: jest.fn(),
  updatePolicy: jest.fn(),
  revokePolicy: jest.fn(),
  getPoliciesByPatient: jest.fn(),
}));

jest.mock('../src/services/proof.service', () => ({
  ...jest.requireActual('../src/services/proof.service'),
  generateProof: jest.fn(),
  verifyProof: jest.fn(),
}));

const app = require('../src/app');
const fabric = require('../src/services/fabric.service');
const consentService = require('../src/services/consent.service');
const proofService = require('../src/services/proof.service');
const { toFieldId, hashIds } = require('../src/services/proof.service');

const PATIENT_TOKEN = jwt.sign(
  { id: 'u1', userId: 'alice', role: 'PATIENT', walletId: 'w1', orgId: 'Org1MSP' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);
const PROVIDER_TOKEN = jwt.sign(
  { id: 'u2', userId: 'drbob', role: 'PROVIDER', walletId: 'w2', orgId: 'Org2MSP' },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

const PATIENT_AUTH = { Authorization: `Bearer ${PATIENT_TOKEN}` };
const PROVIDER_AUTH = { Authorization: `Bearer ${PROVIDER_TOKEN}` };

const PROOF = {
  pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'],
  protocol: 'groth16', curve: 'bn128',
};

// Consistent fixture: derive committed public signals from the SAME policyHash
// and provider the META row references, so the binding gates pass.
const POLICY_HASH = 'cd'.repeat(32);
const POLICY_HASH_TOKEN = proofService.toFieldToken(POLICY_HASH);
const EXPIRE_S = String(Math.floor(new Date('2030-01-01T00:00:00.000Z').getTime() / 1000));
const SIGNALS = [
  '1', // valid
  toFieldId('alice'),
  hashIds(toFieldId('alice'), toFieldId('drbob')).providerIdHash,
  POLICY_HASH_TOKEN,
  EXPIRE_S,
  '424242', // nonce
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('POST /v1/proof/generate', () => {
  test('uses patient identity from JWT (not body) and full policyHash', async () => {
    const policyHash = 'ab'.repeat(32); // 64 hex chars
    consentService.getPolicy.mockResolvedValueOnce({ policyId: 'cp_1', policyHash });

    const patientIdField = toFieldId('alice');
    const { patientIdHash, providerIdHash } = hashIds(patientIdField, toFieldId('drbob'));
    const policyHashToken = proofService.toFieldToken(policyHash);

    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO proof_metadata')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    proofService.generateProof.mockResolvedValueOnce({
      proof: PROOF, publicSignals: ['1', '2', '3', '4', '5', '6'], durationMs: 10,
    });

    const { body, status } = await request(app)
      .post('/v1/proof/generate')
      .set(PATIENT_AUTH)
      .send({
        providerId: 'drbob',
        recordCategories: ['LAB'],
        consentPolicyId: 'cp_1',
        expiry: '2030-01-01T00:00:00.000Z',
      });

    // Contract: patientId is NOT sent in the body and is NOT read from it
    expect(status).toBe(200);
    expect(body.proofId).toMatch(/^prf_/);

    const inputs = proofService.generateProof.mock.calls[0][0];
    expect(inputs.patientId).toBe(patientIdField);
    expect(inputs.providerId).toBe(toFieldId('drbob'));
    expect(inputs.patientIdHash).toBe(patientIdHash);
    expect(inputs.providerIdHash).toBe(providerIdHash);
    // Full-token policyHash (NOT a 16-char substring)
    expect(inputs.policyHash).toBe(policyHashToken);
    expect(inputs.nonce).toMatch(/^\d+$/);
    expect(inputs.expiry).toBe(String(Math.floor(new Date('2030-01-01T00:00:00.000Z').getTime() / 1000)));

    // stored public_signals (the binding gate)
    expect(mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO proof_metadata'))).toBeDefined();
  });

  test('missing consentPolicyId → 400 VALIDATION', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await request(app)
      .post('/v1/proof/generate')
      .set(PATIENT_AUTH)
      .send({ providerId: 'drbob', recordCategories: ['LAB'], expiry: '2030-01-01T00:00:00.000Z' });
    expect(status).toBe(400);
  });

  test('unknown policy → 404 POLICY_NOT_FOUND', async () => {
    consentService.getPolicy.mockResolvedValueOnce(null);
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await request(app)
      .post('/v1/proof/generate')
      .set(PATIENT_AUTH)
      .send({ providerId: 'drbob', recordCategories: ['LAB'], consentPolicyId: 'nope', expiry: '2030-01-01T00:00:00.000Z' });
    expect(status).toBe(404);
  });

  test('requires PATIENT role (PROVIDER → 403)', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await request(app)
      .post('/v1/proof/generate')
      .set(PROVIDER_AUTH)
      .send({ providerId: 'drbob', recordCategories: ['LAB'], consentPolicyId: 'cp_1', expiry: '2030-01-01T00:00:00.000Z' });
    expect(status).toBe(403);
  });
});

describe('POST /v1/proof/verify', () => {
  const META = {
    proof_id: 'prf_x',
    provider_id: 'drbob',
    policy_id: 'cp_1',
    status: 'GENERATED',
    public_signals: SIGNALS,
    expires_at: '2030-01-01T00:00:00.000Z',
  };
  const CHAIN = { accessGranted: true, authorizedCategories: ['LAB'], txId: 'tx99', auditRef: 'aud_x' };

  test('valid proof → 200 accessGranted', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM proof_metadata WHERE proof_id')) return { rows: [META], rowCount: 1 };
      if (sql.includes('UPDATE proof_metadata')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    consentService.getPolicy.mockResolvedValueOnce({ policyId: 'cp_1', policyHash: POLICY_HASH });
    proofService.verifyProof.mockResolvedValueOnce({ isValid: true, durationMs: 100 });
    fabric.submitTransaction.mockResolvedValueOnce(CHAIN);

    const { body, status } = await request(app)
      .post('/v1/proof/verify')
      .set(PROVIDER_AUTH)
      .send({ proofId: 'prf_x', proof: PROOF, publicSignals: SIGNALS });

    expect(status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.accessGranted).toBe(true);
    expect(body.authorizedCategories).toEqual(['LAB']);
    expect(body.txId).toBe('tx99');
    expect(body.auditRef).toBe('aud_x');

    expect(fabric.submitTransaction).toHaveBeenCalledWith(
      'VerifyAndGrantAccess', 'prf_x', 'cp_1', 'drbob'
    );
  });

  test('provider of a different org cannot verify → 403', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM proof_metadata WHERE proof_id')) return { rows: [META], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const { status, body } = await request(app)
      .post('/v1/proof/verify')
      .set(PATIENT_AUTH)
      .send({ proofId: 'prf_x', proof: PROOF, publicSignals: SIGNALS });
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('cryptographically invalid proof → 400 INVALID_PROOF', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM proof_metadata WHERE proof_id')) return { rows: [META], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    consentService.getPolicy.mockResolvedValueOnce({ policyId: 'cp_1', policyHash: POLICY_HASH });
    proofService.verifyProof.mockResolvedValueOnce({ isValid: false, durationMs: 50 });

    const { status, body } = await request(app)
      .post('/v1/proof/verify')
      .set(PROVIDER_AUTH)
      .send({ proofId: 'prf_x', proof: PROOF, publicSignals: SIGNALS });
    expect(status).toBe(400);
    expect(body.error.code).toBe('INVALID_PROOF');
  });

  test('public signals tampered (not the issued proof) → 400 SIGNAL_MISMATCH', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM proof_metadata WHERE proof_id')) return { rows: [META], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    proofService.verifyProof.mockResolvedValueOnce({ isValid: true, durationMs: 50 });

    const tampered = SIGNALS.slice();
    tampered[3] = (BigInt(SIGNALS[3]) + 1n).toString();

    const { status, body } = await request(app)
      .post('/v1/proof/verify')
      .set(PROVIDER_AUTH)
      .send({ proofId: 'prf_x', proof: PROOF, publicSignals: tampered });
    expect(status).toBe(400);
    expect(body.error.code).toBe('SIGNAL_MISMATCH');
    expect(fabric.submitTransaction).not.toHaveBeenCalled();
  });

  test('proof not issued to this provider → 403 PROOF_NOT_FOR_PROVIDER', async () => {
    const other = { ...META, provider_id: 'someone-else' };
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM proof_metadata WHERE proof_id')) return { rows: [other], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const { status, body } = await request(app)
      .post('/v1/proof/verify')
      .set(PROVIDER_AUTH)
      .send({ proofId: 'prf_x', proof: PROOF, publicSignals: SIGNALS });
    expect(status).toBe(403);
    expect(body.error.code).toBe('PROOF_NOT_FOR_PROVIDER');
    expect(fabric.submitTransaction).not.toHaveBeenCalled();
  });

  test('chaincode replay → 409 PROOF_REPLAYED', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM proof_metadata WHERE proof_id')) return { rows: [META], rowCount: 1 };
      if (sql.includes('UPDATE proof_metadata')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    consentService.getPolicy.mockResolvedValueOnce({ policyId: 'cp_1', policyHash: POLICY_HASH });
    proofService.verifyProof.mockResolvedValueOnce({ isValid: true, durationMs: 50 });
    // Real Fabric gateway shapes replay as a gRPC EndorseError: generic message
    // with the chaincode detail in err.details[*].message.
    fabric.submitTransaction.mockRejectedValueOnce(
      Object.assign(new Error('10 ABORTED: failed to endorse transaction, see attached details for more info'), {
        code: 10,
        details: [
          { address: 'peer0.org2.example.com:7051', message: 'chaincode response 500, PROOF_REPLAYED: Proof already consumed', mspId: 'Org2MSP' },
          { address: 'peer1.org2.example.com:7051', message: 'chaincode response 500, PROOF_REPLAYED: Proof already consumed', mspId: 'Org2MSP' },
        ],
      })
    );

    const { status, body } = await request(app)
      .post('/v1/proof/verify')
      .set(PROVIDER_AUTH)
      .send({ proofId: 'prf_x', proof: PROOF, publicSignals: SIGNALS });
    expect(status).toBe(409);
    expect(body.error.code).toBe('PROOF_REPLAYED');
    expect(body.error.message).toBe('PROOF_REPLAYED: Proof already consumed');
  });
});
