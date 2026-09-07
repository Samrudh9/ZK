/**
 * Role-based access control middleware.
 * Usage: router.get('/path', auth, requireRole('PATIENT'), handler)
 *
 * @param  {...string} allowedRoles - One or more roles: PATIENT, PROVIDER, DEVELOPER, ADMIN
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `This action requires one of: ${allowedRoles.join(', ')}. Your role: ${req.user.role}`,
          statusCode: 403,
        },
      });
    }

    next();
  };
}

module.exports = requireRole;
