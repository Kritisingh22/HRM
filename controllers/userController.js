/* User management. Creating a user here IS the "registration" path — accounts are
 * provisioned by HR / Admin (never open self-signup). HR may create EMPLOYEE /
 * MANAGER / HR accounts; only ADMIN / SUPER_ADMIN may create or modify admin-level
 * accounts, and only a SUPER_ADMIN may assign or modify the SUPER_ADMIN role
 * (see the role guards below). Passwords are always hashed by the model. */
const User = require('../models/User');
const { ROLES } = require('../utils/permissions');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');

/* ---------------------------------------------------------------------------
 * Role-assignment & account-modification guards (backend-enforced RBAC).
 * The user routes already restrict these handlers to HR / ADMIN / SUPER_ADMIN,
 * so MANAGER / EMPLOYEE never reach them (they get 403 at the route). These
 * controller checks add the finer role rules the route cannot express, and
 * they hold no matter how the endpoint is reached:
 *   1-5. Only a SUPER_ADMIN may assign the SUPER_ADMIN role.
 *        Only an admin-level actor may assign the ADMIN role (keeps HR out).
 *   6.   No one may change their OWN role.
 *   7-8. A SUPER_ADMIN account may be modified only by a SUPER_ADMIN
 *        (so ADMIN / HR cannot demote or deactivate a SUPER_ADMIN).
 *   10.  The last active SUPER_ADMIN may not be demoted or deactivated.
 * ------------------------------------------------------------------------- */
const ADMIN_LEVEL = ['ADMIN', 'SUPER_ADMIN'];

// Who may ASSIGN a role — on create, or when changing an existing user's role.
function assertCanAssignRole(actor, targetRole) {
  if (!targetRole) return;
  if (targetRole === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a Super Admin can assign the Super Admin role.');
  }
  if (targetRole === 'ADMIN' && !ADMIN_LEVEL.includes(actor.role)) {
    throw ApiError.forbidden('Only an administrator can assign admin-level roles.');
  }
}

// Who may MODIFY an EXISTING account at all (its role or status).
function assertCanModifyTarget(actor, target) {
  if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a Super Admin can modify a Super Admin account.');
  }
  if (target.role === 'ADMIN' && !ADMIN_LEVEL.includes(actor.role)) {
    throw ApiError.forbidden('Only an administrator can modify an admin account.');
  }
}

// Administrative-availability guard (spec rule 4). Two invariants, both 409 Conflict
// (a system-state invariant, not a permission denial — even a permitted actor is blocked):
//   (a) apex protection: the last active SUPER_ADMIN may not be demoted (to anything) or
//       deactivated — otherwise the SUPER_ADMIN role could be lost entirely and never
//       re-assigned (only a SUPER_ADMIN can assign SUPER_ADMIN).
//   (b) availability: the system may never be left without ANY active admin-level
//       (ADMIN or SUPER_ADMIN) account — covers a deployment bootstrapped with only an
//       ADMIN and no Super Admin.
async function assertAdminAvailability(target, nextRole, nextStatus) {
  if (target.status !== 'active') return; // only guarding a currently-active account
  const deactivating = nextStatus !== undefined && nextStatus !== 'active';

  if (target.role === 'SUPER_ADMIN') {
    const losingSuper = deactivating || (nextRole !== undefined && nextRole !== 'SUPER_ADMIN');
    if (losingSuper) {
      const activeSupers = await User.countDocuments({ role: 'SUPER_ADMIN', status: 'active' });
      if (activeSupers <= 1) throw ApiError.conflict('Cannot demote or deactivate the last active Super Admin.');
    }
  }

  if (ADMIN_LEVEL.includes(target.role)) {
    const losingAdminLevel = deactivating || (nextRole !== undefined && !ADMIN_LEVEL.includes(nextRole));
    if (losingAdminLevel) {
      const activeAdmins = await User.countDocuments({ role: { $in: ADMIN_LEVEL }, status: 'active' });
      if (activeAdmins <= 1) throw ApiError.conflict('Cannot deactivate or demote the last active administrator.');
    }
  }
}

exports.list = catchAsync(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  res.json({ count: users.length, users: users.map((u) => u.toSafeJSON()) });
});

exports.create = catchAsync(async (req, res) => {
  const { fullName, email, password, role } = req.body;
  if (!fullName || !email || !password) throw ApiError.badRequest('fullName, email and password are required.');
  if (role && !ROLES.includes(role)) throw ApiError.badRequest('Invalid role.');
  assertCanAssignRole(req.user, role || 'EMPLOYEE'); // (1-5) only Super Admin assigns Super Admin; only admins assign Admin
  if (String(password).length < 8) throw ApiError.badRequest('Password must be at least 8 characters.');

  const attrs = { fullName, email: String(email).toLowerCase(), role: role || 'EMPLOYEE', department: req.body.department, designation: req.body.designation, status: 'active', isVerified: true };
  if (req.body.employeeId) attrs.employeeId = req.body.employeeId;
  const user = new User(attrs);
  user.password = password;
  await user.save();
  logAudit(req, { action: 'user.create', targetType: 'User', targetId: user._id, description: `Created ${user.role} account ${user.email}` });
  res.status(201).json({ user: user.toSafeJSON() });
});

exports.update = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');

  const isSelf = String(user._id) === String(req.user._id);

  // (7,8) Only a Super Admin may touch a Super Admin; only admins may touch an admin.
  assertCanModifyTarget(req.user, user);

  if (req.body.role !== undefined && !ROLES.includes(req.body.role)) throw ApiError.badRequest('Invalid role.');
  const roleChange = req.body.role !== undefined && req.body.role !== user.role;

  // (6) No one may change their own role.
  if (roleChange && isSelf) throw ApiError.forbidden('You cannot change your own role.');

  // (1-5) Only a Super Admin may assign Super Admin; only admins may assign Admin.
  if (roleChange) assertCanAssignRole(req.user, req.body.role);

  // (rule 4) Protect administrative availability: never remove the last active Super
  // Admin, and never leave the system without any active admin-level account.
  await assertAdminAvailability(user, roleChange ? req.body.role : undefined, req.body.status);

  if (roleChange) user.role = req.body.role;
  ['status', 'department', 'designation', 'fullName'].forEach((k) => { if (req.body[k] !== undefined) user[k] = req.body[k]; });
  if (req.body.employeeId) user.employeeId = req.body.employeeId;
  await user.save();
  const changed = [];
  if (roleChange) changed.push(`role→${user.role}`);
  ['status', 'department', 'designation', 'fullName', 'employeeId'].forEach((k) => { if (req.body[k] !== undefined) changed.push(`${k}→${req.body[k]}`); });
  logAudit(req, { action: 'user.update', targetType: 'User', targetId: user._id, description: `Updated ${user.email}: ${changed.join(', ') || 'no change'}` });
  res.json({ user: user.toSafeJSON() });
});
