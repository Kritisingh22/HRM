/* Permission Management API — manage granular permissions for HR users.
 * Only ADMIN/SUPER_ADMIN can manage permissions for other users.
 * HR can only manage permissions if they have the 'users:manage' or 'permissions:manage' permission. */
const User = require('../models/User');
const { ROLES, MODULES, ACTIONS, userHasPermission } = require('../utils/permissions');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const Notification = require('../models/Notification');

// Helper: generate all possible module:action permissions
function generateAllPermissions() {
  const perms = [];
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      perms.push(`${module}:${action}`);
    }
    // Also add module:* wildcard
    perms.push(`${module}:*`);
  }
  return perms;
}

const ALL_PERMISSIONS = generateAllPermissions();

// Validate permission strings
function isValidPermission(perm) {
  return ALL_PERMISSIONS.includes(perm) || perm === '*';
}

// Check if actor can manage target user's permissions
async function assertCanManagePermissions(actor, target) {
  // SUPER_ADMIN can manage anyone
  if (actor.role === 'SUPER_ADMIN') return;
  
  // ADMIN can manage HR, MANAGER, EMPLOYEE (but not SUPER_ADMIN or ADMIN)
  if (actor.role === 'ADMIN') {
    if (['SUPER_ADMIN', 'ADMIN'].includes(target.role)) {
      throw ApiError.forbidden('Admins cannot manage Super Admin or Admin permissions.');
    }
    return;
  }
  
  // HR can manage permissions only if they have users:manage or permissions:manage
  if (actor.role === 'HR') {
    if (!userHasPermission(actor, 'users:manage') && !userHasPermission(actor, 'permissions:manage')) {
      throw ApiError.forbidden('You do not have permission to manage user permissions.');
    }
    // HR cannot manage SUPER_ADMIN, ADMIN, or other HR accounts
    if (['SUPER_ADMIN', 'ADMIN', 'HR'].includes(target.role)) {
      throw ApiError.forbidden('You cannot manage permissions for this role.');
    }
    return;
  }
  
  throw ApiError.forbidden('You do not have permission to manage user permissions.');
}

/* GET /api/permissions/modules — list all available modules and actions */
exports.getModulesAndActions = catchAsync(async (req, res) => {
  res.json({ modules: MODULES, actions: ACTIONS, allPermissions: ALL_PERMISSIONS });
});

/* GET /api/permissions/user/:userId — get a user's current permissions */
exports.getUserPermissions = catchAsync(async (req, res) => {
  const target = await User.findById(req.params.userId).select('permissions role fullName email');
  if (!target) throw ApiError.notFound('User not found.');
  
  await assertCanManagePermissions(req.user, target);
  
  // Return role defaults + user-specific overrides
  const rolePerms = require('../utils/permissions').permissionsFor(target.role);
  const userPerms = target.permissions || [];
  
  res.json({
    userId: target._id,
    name: target.fullName,
    email: target.email,
    role: target.role,
    rolePermissions: rolePerms,
    userPermissions: userPerms,
    effectivePermissions: [...new Set([...rolePerms, ...userPerms])]
  });
});

/* PUT /api/permissions/user/:userId — update a user's permissions */
exports.updateUserPermissions = catchAsync(async (req, res) => {
  const { permissions } = req.body; // array of permission strings
  
  if (!Array.isArray(permissions)) {
    throw ApiError.badRequest('permissions must be an array of strings.');
  }
  
  // Validate all permissions
  for (const perm of permissions) {
    if (!isValidPermission(perm)) {
      throw ApiError.badRequest(`Invalid permission: ${perm}`);
    }
  }
  
  const target = await User.findById(req.params.userId);
  if (!target) throw ApiError.notFound('User not found.');
  
  await assertCanManagePermissions(req.user, target);
  
  const oldPermissions = target.permissions || [];
  target.permissions = permissions;
  await target.save();
  
  logAudit(req, {
    action: 'user.permissions.update',
    targetType: 'User',
    targetId: target._id,
    description: `Updated permissions for ${target.email}: ${oldPermissions.join(', ') || 'none'} -> ${permissions.join(', ') || 'none'}`
  });
  
  // Create notification for the target user
  await Notification.create({
    user: target._id,
    type: 'Permission Update',
    title: 'Your HRM Permissions Have Been Updated',
    message: `Your permissions have been changed by ${req.user.fullName} (${req.user.role}). Please review your updated access.`,
    priority: 'Normal',
    channels: { inApp: true, email: false },
    metadata: {
      changedBy: req.user._id,
      changedByName: req.user.fullName,
      changedByRole: req.user.role,
      oldPermissions,
      newPermissions: permissions
    }
  });
  
  res.json({
    userId: target._id,
    name: target.fullName,
    email: target.email,
    role: target.role,
    permissions: target.permissions,
    message: 'Permissions updated successfully. User has been notified.'
  });
});

/* POST /api/permissions/user/:userId/add — add permissions to a user */
exports.addUserPermissions = catchAsync(async (req, res) => {
  const { permissions } = req.body;
  
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw ApiError.badRequest('permissions must be a non-empty array.');
  }
  
  for (const perm of permissions) {
    if (!isValidPermission(perm)) {
      throw ApiError.badRequest(`Invalid permission: ${perm}`);
    }
  }
  
  const target = await User.findById(req.params.userId);
  if (!target) throw ApiError.notFound('User not found.');
  
  await assertCanManagePermissions(req.user, target);
  
  const oldPermissions = target.permissions || [];
  const newPermissions = [...new Set([...oldPermissions, ...permissions])];
  target.permissions = newPermissions;
  await target.save();
  
  logAudit(req, {
    action: 'user.permissions.add',
    targetType: 'User',
    targetId: target._id,
    description: `Added permissions for ${target.email}: ${permissions.join(', ')}`
  });
  
  // Create notification
  await Notification.create({
    user: target._id,
    type: 'Permission Granted',
    title: 'New Permissions Granted',
    message: `${req.user.fullName} (${req.user.role}) granted you the following permissions: ${permissions.join(', ')}.`,
    priority: 'Normal',
    channels: { inApp: true, email: false },
    metadata: {
      changedBy: req.user._id,
      changedByName: req.user.fullName,
      changedByRole: req.user.role,
      addedPermissions: permissions
    }
  });
  
  res.json({
    userId: target._id,
    permissions: target.permissions,
    added: permissions,
    message: 'Permissions added successfully. User has been notified.'
  });
});

/* POST /api/permissions/user/:userId/remove — remove permissions from a user */
exports.removeUserPermissions = catchAsync(async (req, res) => {
  const { permissions } = req.body;
  
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw ApiError.badRequest('permissions must be a non-empty array.');
  }
  
  const target = await User.findById(req.params.userId);
  if (!target) throw ApiError.notFound('User not found.');
  
  await assertCanManagePermissions(req.user, target);
  
  const oldPermissions = target.permissions || [];
  const newPermissions = oldPermissions.filter(p => !permissions.includes(p));
  target.permissions = newPermissions;
  await target.save();
  
  logAudit(req, {
    action: 'user.permissions.remove',
    targetType: 'User',
    targetId: target._id,
    description: `Removed permissions for ${target.email}: ${permissions.join(', ')}`
  });
  
  // Create notification
  await Notification.create({
    user: target._id,
    type: 'Permission Revoked',
    title: 'Permissions Revoked',
    message: `${req.user.fullName} (${req.user.role}) revoked the following permissions: ${permissions.join(', ')}.`,
    priority: 'High',
    channels: { inApp: true, email: false },
    metadata: {
      changedBy: req.user._id,
      changedByName: req.user.fullName,
      changedByRole: req.user.role,
      removedPermissions: permissions
    }
  });
  
  res.json({
    userId: target._id,
    permissions: target.permissions,
    removed: permissions,
    message: 'Permissions removed successfully. User has been notified.'
  });
});

/* GET /api/permissions/me — get current user's effective permissions */
exports.getMyPermissions = catchAsync(async (req, res) => {
  const rolePerms = require('../utils/permissions').permissionsFor(req.user.role);
  const userPerms = req.user.permissions || [];
  
  res.json({
    userId: req.user._id,
    name: req.user.fullName,
    email: req.user.email,
    role: req.user.role,
    rolePermissions: rolePerms,
    userPermissions: userPerms,
    effectivePermissions: [...new Set([...rolePerms, ...userPerms])]
  });
});