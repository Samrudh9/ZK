const { Router } = require('express');
const { z } = require('zod');
const authService = require('../../services/auth.service');
const authMiddleware = require('../middleware/auth.middleware');

const router = Router();

// ── Validation schemas ──────────────────────────────────────────────

const registerSchema = z.object({
  userId: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['PATIENT', 'PROVIDER']),
  orgId: z.string().default('Org1MSP'),
});

const loginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── POST /auth/register ─────────────────────────────────────────────

router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    // Map role to Fabric org
    const orgId = data.role === 'PROVIDER' ? 'Org2MSP' : 'Org1MSP';

    const result = await authService.registerUser({
      userId: data.userId,
      password: data.password,
      role: data.role,
      orgId,
    });

    res.status(201).json({
      walletId: result.walletId,
      message: 'User registered successfully',
    });
  } catch (err) {
    if (err.code === '23505') {
      // PostgreSQL unique violation
      return res.status(409).json({
        error: {
          code: 'USER_EXISTS',
          message: 'A user with this ID already exists',
          statusCode: 409,
        },
      });
    }
    next(err);
  }
});

// ── POST /auth/login ────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.loginUser(data);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      role: result.role,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/refresh ──────────────────────────────────────────────

router.post('/refresh', async (req, res, next) => {
  try {
    const data = refreshSchema.parse(req.body);
    const result = await authService.refreshAccessToken(data.refreshToken);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /auth/logout ─────────────────────────────────────────────

router.delete('/logout', authMiddleware, async (req, res, next) => {
  try {
    await authService.revokeRefreshTokens(req.user.id);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
