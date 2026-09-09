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

  // Map zod validation failures to a clean 400 (matches the API contract)
  if (err.name === 'ZodError') {
    statusCode = 400;
    code = 'VALIDATION';
    message = err.issues
      ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'Request validation failed';
  }

  // Fabric gateway wraps chaincode errors as gRPC "ABORTED" (EndorseError);
  // the real chaincode message lives in err.details[*].message as
  // "chaincode response 500, PROOF_REPLAYED: ...". Surface it for mapping.
  let chaincodeMessage = '';
  if (err.message && err.message.startsWith('10 ABORTED') && Array.isArray(err.details)) {
    const detail = err.details.find((d) => d && typeof d.message === 'string');
    if (detail) chaincodeMessage = detail.message;
  }
  const effectiveMessage = chaincodeMessage || message;

  // Map known error strings from chaincode
  if (effectiveMessage.includes('PROOF_REPLAYED')) {
    statusCode = 409;
    code = 'PROOF_REPLAYED';
  } else if (effectiveMessage.includes('POLICY_INACTIVE')) {
    statusCode = 403;
    code = 'POLICY_INACTIVE';
  } else if (effectiveMessage.includes('POLICY_NOT_FOUND')) {
    statusCode = 404;
    code = 'POLICY_NOT_FOUND';
  } else if (effectiveMessage.includes('INVALID_PROOF')) {
    statusCode = 400;
    code = 'INVALID_PROOF';
  } else if (effectiveMessage.includes('PROOF_EXPIRED')) {
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

  // Use the chaincode detail as the reported message when available (clearer
  // than the gRPC "10 ABORTED" wrapper), stripping any "chaincode response N, "
  // prefix that grpc-js prepends.
  let reportMessage = message;
  if (chaincodeMessage) {
    reportMessage = chaincodeMessage
      .replace(/^chaincode response \d+,?\s*/i, '')
      .trim();
  }

  res.status(statusCode).json({
    error: {
      code,
      message: reportMessage,
      statusCode,
      requestId,
    },
  });
}

module.exports = errorHandler;
