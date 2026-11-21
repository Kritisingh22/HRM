/* ============================================================
   User serialization utility — handles both Mongoose documents
   and plain JavaScript objects (e.g. from .lean() queries).

   Security: Uses an explicit allowlist of safe fields rather than
   deleting known sensitive properties. Never exposes password hashes,
   tokens, or session internals.

   Usage:
     const safe = serializeUser(req.user);
     res.json({ user: safe });
   ============================================================ */

const ApiError = require('../utils/ApiError');

/**
 * Serialize a user object safely, supporting both Mongoose documents
 * and plain JS objects (e.g. from .lean() queries).
 *
 * @param {any} user - The user object (Mongoose doc, lean object, or partial)
 * @returns {Object} A safe plain object with only approved fields
 * @throws {ApiError} If user is falsy or has no recoverable identity
 */
function serializeUser(user) {
  if (!user) {
    throw ApiError.unauthorized('User not found.');
  }

  let safeUser;

  // Case 1: Mongoose document — has toSafeJSON() method
  if (typeof user.toSafeJSON === 'function') {
    safeUser = user.toSafeJSON();

    // Ensure passwordHash is never included even if schema changes
    delete safeUser.passwordHash;
    delete safeUser.passwordResetToken;
    delete safeUser.activationToken;
    delete safeUser.passwordResetExpires;
    delete safeUser.activationTokenExpires;

    return safeUser;
  }

  // Case 2: Plain object (from .lean() or JWT decode)
  // Build from an explicit allowlist of safe fields
  const safeFields = [
    '_id',
    'employeeId',
    'fullName',
    'name',
    'email',
    'username',
    'role',
    'department',
    'designation',
    'status',
    'accountStatus',
    'isVerified',
    'mustChangePassword',
    'permissions',
    'lastLogin',
    'createdAt',
    'updatedAt',
  ];

  safeUser = {};
  for (const field of safeFields) {
    if (field in user) {
      safeUser[field] = user[field];
    }
  }

  // Strip any sensitive fields that might leak through
  delete safeUser.passwordHash;
  delete safeUser.passwordResetToken;
  delete safeUser.activationToken;
  delete safeUser.passwordResetExpires;
  delete safeUser.activationTokenExpires;

  // Ensure permissions array exists
  if (safeUser.permissions === undefined) {
    safeUser.permissions = user.permissions || [];
  }

  return safeUser;
}

module.exports = serializeUser;