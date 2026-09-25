/* Role-Based Access Control (RBAC): the single source of truth for what each
 * role may do. Permissions are "<resource>:<action>" strings. A "*" wildcard
 * grants everything; "<resource>:*" grants all actions on that resource.
 *
 * Enforced on the SERVER (middleware/authorize.js + per-resource ownership
 * checks in controllers). Reads are usually gated by authenticate + row-level
 * scoping in the controller; writes/admin actions are gated by these permissions.
 * The role always comes from the verified JWT / database, never from the client.
<<<<<<< HEAD
 */
=======
 *
 * User-specific permissions (stored on the User model) ADD to or OVERRIDE role
 * permissions. An empty permissions array means "use role defaults only".
 * This allows granular control for HR users without changing their base role. */
>>>>>>> 0f31467 (intial Update HRM 1.1)
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];

const PERMISSIONS = {
  SUPER_ADMIN: ['*'],

  ADMIN: [
    'users:manage',
    'employees:*', 'leaves:*', 'attendance:*', 'payroll:*', 'hiring:*',
    'performance:*', 'projects:*', 'documents:*', 'notices:*', 'helpdesk:*',
<<<<<<< HEAD
    'offboarding:*', 'reports:read', 'analytics:read', 'audit:read'
=======
    'offboarding:*', 'reports:read', 'analytics:read', 'audit:read',
    'dailyReports:*', 'notifications:*', 'requirements:*', 'transfers:*'
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ],

  HR: [
    'employees:read', 'employees:write', 'employees:delete',
    'leaves:read', 'leaves:write', 'leaves:approve',
    'attendance:read', 'attendance:write',
    'payroll:read', 'payroll:write',
    'hiring:read', 'hiring:write', 'hiring:delete',
    'performance:read', 'performance:write',
    'projects:read', 'projects:write',
    'documents:read', 'documents:write', 'documents:delete',
    'notices:read', 'notices:write', 'notices:delete',
    'helpdesk:read', 'helpdesk:write', 'helpdesk:manage',
    'offboarding:read', 'offboarding:write',
    'users:read',
<<<<<<< HEAD
    'reports:read', 'analytics:read', 'audit:read'
  ],

  MANAGER: [
    'employees:read',
=======
    'reports:read', 'analytics:read', 'audit:read',
    'dailyReports:read', 'dailyReports:write', 'dailyReports:approve',
    'notifications:read',
    'requirements:*', 'transfers:*'
  ],

  MANAGER: [
    'employees:read', 'employees:update',
>>>>>>> 0f31467 (intial Update HRM 1.1)
    'leaves:read', 'leaves:approve',
    'attendance:read',
    'performance:read', 'performance:write',   // for their team (scoped in controller)
    'projects:read', 'projects:write',
    'documents:read',
    'notices:read',
    'helpdesk:read', 'helpdesk:write', 'helpdesk:manage',
    'reports:read', 'analytics:read',
<<<<<<< HEAD
    // own self-service
    'leaves:read_own', 'leaves:write_own', 'attendance:read_own', 'payroll:read_own',
    'employees:read_own', 'performance:read_own', 'projects:read_own', 'documents:read_own',
    'documents:write_own', 'helpdesk:write_own'
=======
    'dailyReports:read', 'dailyReports:write', 'dailyReports:approve',
    'notifications:read',
    'requirements:read', 'requirements:write', 'requirements:read_own', 'requirements:write_own',
    // own self-service
    'leaves:read_own', 'leaves:write_own', 'attendance:read_own', 'payroll:read_own',
    'employees:read_own', 'performance:read_own', 'projects:read_own', 'documents:read_own',
    'documents:write_own', 'helpdesk:write_own', 'dailyReports:read_own', 'dailyReports:write_own',
    'notifications:read_own'
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ],

  EMPLOYEE: [
    'employees:read_own',
    'leaves:read_own', 'leaves:write_own',
    'attendance:read_own',
    'payroll:read_own',
    'performance:read_own',
    'projects:read_own',
    'documents:read_own', 'documents:write_own',
    'notices:read',
<<<<<<< HEAD
    'helpdesk:read_own', 'helpdesk:write_own'
  ]
};

=======
    'helpdesk:read_own', 'helpdesk:write_own',
    'dailyReports:read_own', 'dailyReports:write_own',
    'notifications:read_own'
  ]
};

// Module list for UI/permission management
const MODULES = [
  'dashboard', 'employees', 'attendance', 'leave', 'payroll', 'payslips',
  'recruitment', 'documents', 'projects', 'reports', 'analytics',
  'requirements', 'transfers', 'notifications', 'settings', 'offboarding',
  'hiring', 'performance', 'helpdesk', 'notices', 'orgChart', 'dailyReports', 'audit'
];

// Action list for permission management
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'download', 'export', 'manage', 'assignPermissions'];

>>>>>>> 0f31467 (intial Update HRM 1.1)
function permissionsFor(role) { return PERMISSIONS[role] || []; }

function hasPermission(role, permission) {
  const perms = permissionsFor(role);
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  const resource = permission.split(':')[0];
  if (perms.includes(resource + ':*')) return true;
  return false;
}

<<<<<<< HEAD
module.exports = { ROLES, PERMISSIONS, permissionsFor, hasPermission };
=======
/**
 * Check if a user has a specific permission, considering both role-based
 * and user-specific permissions.
 * @param {Object} user - The user object (must have role and permissions fields)
 * @param {string} permission - The permission to check (e.g., "leave:approve")
 * @returns {boolean}
 */
function userHasPermission(user, permission) {
  if (!user) return false;
  
  // Check user-specific permissions first (these ADD to or OVERRIDE role permissions)
  const userPerms = user.permissions || [];
  if (userPerms.includes('*')) return true;
  if (userPerms.includes(permission)) return true;
  const resource = permission.split(':')[0];
  if (userPerms.includes(resource + ':*')) return true;
  
  // Fall back to role-based permissions
  return hasPermission(user.role, permission);
}

/**
 * Check if a user has ANY of the given permissions (OR logic)
 */
function userHasAnyPermission(user, permissions) {
  return permissions.some(p => userHasPermission(user, p));
}

/**
 * Check if a user has ALL of the given permissions (AND logic)
 */
function userHasAllPermissions(user, permissions) {
  return permissions.every(p => userHasPermission(user, p));
}

module.exports = { 
  ROLES, 
  PERMISSIONS, 
  MODULES,
  ACTIONS,
  permissionsFor, 
  hasPermission,
  userHasPermission,
  userHasAnyPermission,
  userHasAllPermissions
};
>>>>>>> 0f31467 (intial Update HRM 1.1)
