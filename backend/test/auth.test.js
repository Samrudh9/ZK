const request = require('supertest');
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');

// Mock PostgreSQL before importing app
const mockQuery = jest.fn();
jest.mock('../src/db/pool', () => ({ query: (...a) => mockQuery(...a) }));

const app = require('../src/app');

const HASH = bcrypt.hashSync('alicepw', 10);

function stubPoolLogin(rows = []) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM users WHERE user_id')) return { rows, rowCount: rows.length };
    if (sql.includes('INSERT INTO refresh_tokens')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
}

describe('POST /v1/auth/login', () => {
  test('valid credentials → 200 with accessToken + role', async () => {
    stubPoolLogin([{
      id: 'u1', user_id: 'alice', role: 'PATIENT', org_id: 'Org1MSP',
      password_hash: HASH, wallet_id: 'w1',
    }]);

    const { body, status } = await request(app)
      .post('/v1/auth/login')
      .send({ userId: 'alice', password: 'alicepw' });

    expect(status).toBe(200);
    expect(body.accessToken).toBeDefined();
    expect(body.role).toBe('PATIENT');
    expect(body.refreshToken).toBeDefined();
    expect(body.expiresIn).toBe(env.JWT_EXPIRY);
  });

  test('wrong password → 401 UNAUTHORIZED', async () => {
    stubPoolLogin([{
      id: 'u1', user_id: 'alice', role: 'PATIENT', org_id: 'Org1MSP',
      password_hash: HASH, wallet_id: 'w1',
    }]);

    const { body, status } = await request(app)
      .post('/v1/auth/login')
      .send({ userId: 'alice', password: 'wrong' });

    expect(status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('missing body → 400 VALIDATION', async () => {
    mockQuery.mockReset();
    const { body, status } = await request(app)
      .post('/v1/auth/login')
      .send({});

    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION');
  });
});
