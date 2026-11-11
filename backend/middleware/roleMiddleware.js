/**
 * Role-Based Access Control (RBAC) Middleware
 * Restricts route access to specified roles (e.g. 'Admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. This operation requires one of the following roles: [${allowedRoles.join(', ')}]. Your current role is "${req.user.role}".`
      });
    }

    next();
  };
}

module.exports = {
  requireRole
};

