/**
 * Role-Based Access Control (RBAC) Middleware for API Gateway
 * 
 * This middleware extracts roles from JWT payload and enforces role-based access control
 */

const ROLES = {
  USER: 'user',
  ORGANIZER: 'organizer',
  ADMIN: 'admin'
};

/**
 * Middleware to require specific role(s)
 * Usage: app.post('/api/events', requireRole('organizer'), createEvent)
 */
function requireRole(requiredRole) {
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }

    // Get user roles from JWT payload (set by auth middleware)
    const userRoles = req.userRoles || [ROLES.USER];

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
        userRoles: userRoles,
        requiredRoles: requiredRoles
      });
    }

    next();
  };
}

/**
 * Check if user is organizer or admin
 */
function requireOrganizer(req, res, next) {
  return requireRole([ROLES.ORGANIZER, ROLES.ADMIN])(req, res, next);
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
  return requireRole(ROLES.ADMIN)(req, res, next);
}

module.exports = {
  ROLES,
  requireRole,
  requireOrganizer,
  requireAdmin
};
