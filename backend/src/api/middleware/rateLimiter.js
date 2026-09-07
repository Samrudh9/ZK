const rateLimit = require('express-rate-limit');
const env = require('../../config/env');

/**
 * General rate limiter — 100 requests per minute per IP.
 */
const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_GENERAL,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
      statusCode: 429,
    },
  },
});

/**
 * Proof-specific rate limiter — 20 requests per minute per IP.
 * Proof generation is CPU-intensive; this prevents abuse.
 */
const proofLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_PROOF,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Proof generation rate limit exceeded',
      statusCode: 429,
    },
  },
});

module.exports = { generalLimiter, proofLimiter };
