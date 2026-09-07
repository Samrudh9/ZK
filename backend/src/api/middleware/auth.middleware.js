const jwt = require('jsonwebtoken');
const env = require('../../config/env');

/**
 * JWT authentication middleware.
 * Extracts Bearer token, verifies it, and attaches decoded user to req.user.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
        statusCode: 401,
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      userId: decoded.userId,
      role: decoded.role,
      walletId: decoded.walletId,
      orgId: decoded.orgId,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired',
          statusCode: 401,
        },
      });
    }
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
        statusCode: 401,
      },
    });
  }
}

module.exports = authMiddleware;
