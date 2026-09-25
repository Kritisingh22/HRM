/* Authorization guards. Use AFTER authenticate. Role/permission come from the
 * verified user, so these cannot be bypassed from the browser. Object-level
 * (row-level) ownership checks live in the controllers themselves. */
const ApiError = require('../utils/ApiError');
const { hasPermission } = require('../utils/permissions');

// require one of the given roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    next();
  };
}

// require a specific "<resource>:<action>" permission
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    next();
  };
}

module.exports = { requireRole, requirePermission };
