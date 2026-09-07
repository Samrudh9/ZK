const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { query } = require('../db/pool');
const logger = require('../config/logger');

const SALT_ROUNDS = 12;

/**
 * Register a new user — stores credentials in PostgreSQL.
 */
async function registerUser({ userId, password, role, orgId }) {
  const id = uuidv4();
  const walletId = uuidv4();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await query(
    `INSERT INTO users (id, user_id, role, org_id, password_hash, wallet_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, role, orgId, passwordHash, walletId]
  );

  logger.info('User registered', { userId, role, orgId });
  return { id, walletId, role, orgId };
}

/**
 * Authenticate a user and return tokens.
 */
async function loginUser({ userId, password }) {
  const { rows } = await query(
    'SELECT * FROM users WHERE user_id = $1',
    [userId]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user);

  return {
    accessToken,
    refreshToken,
    expiresIn: env.JWT_EXPIRY,
    role: user.role,
  };
}

/**
 * Generate a JWT access token.
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      userId: user.user_id,
      role: user.role,
      walletId: user.wallet_id,
      orgId: user.org_id,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY }
  );
}

/**
 * Generate and store a refresh token.
 */
async function generateRefreshToken(user) {
  const tokenId = uuidv4();
  const token = jwt.sign(
    { id: user.id, tokenId },
    env.REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY }
  );

  const tokenHash = await bcrypt.hash(tokenId, 8);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY * 1000);

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenId, user.id, tokenHash, expiresAt]
  );

  return token;
}

/**
 * Refresh an access token using a valid refresh token.
 */
async function refreshAccessToken(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.REFRESH_SECRET);
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const { rows } = await query(
    'SELECT * FROM refresh_tokens WHERE id = $1 AND revoked = false',
    [decoded.tokenId]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Refresh token revoked or not found'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const rt = rows[0];
  if (new Date() > new Date(rt.expires_at)) {
    throw Object.assign(new Error('Refresh token expired'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  // Get user
  const userResult = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
  if (userResult.rows.length === 0) {
    throw Object.assign(new Error('User not found'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  // Rotate: revoke old, issue new
  await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [decoded.tokenId]);

  const user = userResult.rows[0];
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: env.JWT_EXPIRY,
  };
}

/**
 * Revoke all refresh tokens for a user (logout).
 */
async function revokeRefreshTokens(userId) {
  await query(
    'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
    [userId]
  );
  logger.info('Refresh tokens revoked', { userId });
}

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  revokeRefreshTokens,
};
