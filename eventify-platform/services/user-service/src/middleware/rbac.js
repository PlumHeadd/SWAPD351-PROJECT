/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Roles:
 * - user: Basic authenticated user (can browse, RSVP, chat)
 * - organizer: Can create and manage events
 * - admin: Full system access
 */

const ROLES = {
  USER: 'user',
  ORGANIZER: 'organizer',
  ADMIN: 'admin'
};

const ROLE_HIERARCHY = {
  [ROLES.USER]: 1,
  [ROLES.ORGANIZER]: 2,
  [ROLES.ADMIN]: 3
};

/**
 * Middleware to require specific role
 * @param {string|string[]} requiredRole - Role(s) required to access endpoint
 */
function requireRole(requiredRole) {
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }

    // Get user roles (default to 'user' if not set)
    const userRoles = req.user.roles || [ROLES.USER];

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
 * Middleware to require minimum role level
 * @param {string} minimumRole - Minimum role required
 */
function requireMinimumRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    const userRoles = req.user.roles || [ROLES.USER];
    const minimumLevel = ROLE_HIERARCHY[minimumRole] || 1;

    // Check if user has any role at or above minimum level
    const hasMinimumRole = userRoles.some(role => {
      const roleLevel = ROLE_HIERARCHY[role] || 0;
      return roleLevel >= minimumLevel;
    });

    if (!hasMinimumRole) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This action requires ${minimumRole} role or higher`
      });
    }

    next();
  };
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
  return requireRole(ROLES.ADMIN)(req, res, next);
}

/**
 * Check if user is organizer or admin
 */
function requireOrganizer(req, res, next) {
  return requireRole([ROLES.ORGANIZER, ROLES.ADMIN])(req, res, next);
}

/**
 * Check if user owns resource or is admin
 * @param {Function} getResourceOwnerId - Function to extract owner ID from request
 */
function requireOwnershipOrAdmin(getResourceOwnerId) {
  return (req, res, next) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resourceOwnerId = getResourceOwnerId(req);
    const userRoles = req.user.roles || [ROLES.USER];

    // Admin can access anything
    if (userRoles.includes(ROLES.ADMIN)) {
      return next();
    }

    // Check ownership
    if (req.user.id === resourceOwnerId) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'You can only modify your own resources'
    });
  };
}

/**
 * Assign default role to new user
 */
function assignDefaultRole(user) {
  if (!user.roles || user.roles.length === 0) {
    user.roles = [ROLES.USER];
  }
  return user;
}

/**
 * Promote user to organizer
 */
function promoteToOrganizer(user) {
  const roles = user.roles || [ROLES.USER];
  if (!roles.includes(ROLES.ORGANIZER)) {
    roles.push(ROLES.ORGANIZER);
  }
  user.roles = roles;
  return user;
}

/**
 * Check if user has role
 */
function hasRole(user, role) {
  if (!user || !user.roles) return false;
  return user.roles.includes(role);
}

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  requireRole,
  requireMinimumRole,
  requireAdmin,
  requireOrganizer,
  requireOwnershipOrAdmin,
  assignDefaultRole,
  promoteToOrganizer,
  hasRole
};
