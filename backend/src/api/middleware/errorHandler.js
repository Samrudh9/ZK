const logger = require('../../config/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Global error handler.
 * Matches the error response format from backend.md:
 * { error: { code, message, statusCode, requestId } }
 */
function errorHandler(err, req, res, _next) {
  const requestId = `req_${uuidv4().substring(0, 8)}`;

  // Determine status code
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Map known error strings from chaincode
  if (message.includes('PROOF_REPLAYED')) {
    statusCode = 409;
    code = 'PROOF_REPLAYED';
  } else if (message.includes('POLICY_INACTIVE')) {
    statusCode = 403;
    code = 'POLICY_INACTIVE';
  } else if (message.includes('POLICY_NOT_FOUND')) {
    statusCode = 404;
    code = 'POLICY_NOT_FOUND';
  } else if (message.includes('INVALID_PROOF')) {
    statusCode = 400;
    code = 'INVALID_PROOF';
  } else if (message.includes('PROOF_EXPIRED')) {
    statusCode = 400;
    code = 'PROOF_EXPIRED';
  }

  // Log
  if (statusCode >= 500) {
    logger.error(`[${requestId}] ${code}: ${message}`, {
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.warn(`[${requestId}] ${code}: ${message}`, {
      path: req.path,
      method: req.method,
    });
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      statusCode,
      requestId,
    },
  });
}

module.exports = errorHandler;
