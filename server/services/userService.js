/* ============================================================
   User Service — cross-collection business logic for user changes.

   When a user's role, status, department, or manager changes:
   • Audit the change (who/when/old/new) — audit log already exists.
   • Revoke ALL refresh tokens if role changes or status becomes inactive.
   • Send a notification to the affected user.
   • Never return password hashes or token hashes.
   ============================================================ */

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Notification = require('../models/Notification');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('./notificationService');

/* Maximum active (non-revoked, non-expired) refresh tokens per user. */
const MAX_ACTIVE_TOKENS_PER_USER = 5;

/**
 * Revoke all non-revoked, non-expired refresh tokens for a user.
 * Used on password change, role change, deactivation, or offboarding.
 * @param {mongoose.Types.ObjectId} userId
 * @param {string} reason - human-readable reason for the audit log
 * @param {Object} [req] - Express request (for audit actor/IP)
 * @returns {Promise<{revokedCount: number}>}
 */
async function revokeUserTokens(userId, reason, req) {
  try {
    const result = await RefreshToken.updateMany(
      {
        user: userId,
        revoked: false,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
      {
        $set: { revoked: true, replacedByHash: null },
      },
    );

    if (result.modifiedCount > 0) {
      logAudit(req, {
        action: 'user.tokens_revoked',
        targetType: 'User',
        targetId: String(userId),
        description: `Revoked ${result.modifiedCount} refresh token(s): ${reason}`,
      });
    }

    return { revokedCount: result.modifiedCount };
  } catch (err) {
    console.error('[userService] revokeUserTokens failed:', err.message);
    return { revokedCount: 0 };
  }
}

/**
 * Enforce the maximum active tokens per user. Revokes the oldest
 * non-revoked tokens when a user exceeds the limit.
 * @param {mongoose.Types.ObjectId} userId
 * @returns {Promise<{revokedCount: number}>}
 */
async function enforceTokenLimit(userId) {
  try {
    const activeTokens = await RefreshToken.find({
      user: userId,
      revoked: false,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ createdAt: 1 }) // oldest first
      .limit(Math.max(0, MAX_ACTIVE_TOKENS_PER_USER))
      .select('_id');

    const activeIds = activeTokens.map((t) => t._id);

    const result = await RefreshToken.updateMany(
      {
        user: userId,
        revoked: false,
        _id: { $nin: activeIds },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
      { $set: { revoked: true } },
    );

    return { revokedCount: result.modifiedCount };
  } catch (err) {
    console.error('[userService] enforceTokenLimit failed:', err.message);
    return { revokedCount: 0 };
  }
}

/**
 * Propagate a user change across collections.
 * Called after a User document is updated with role/status/department/manager changes.
 * @param {Object} user - the User document (post-update, from DB)
 * @param {Object} changes - { role?: {before, after}, status?: {...}, department?: {...}, manager?: {...} }
 * @param {Object} req - Express request (for audit + notification actor)
 * @param {Object} [session] - optional mongoose session
 * @returns {Promise<{revokedCount: number, notified: boolean}>}
 */
async function propagateUserChange(user, changes, req, session) {
  const result = { revokedCount: 0, notified: false };

  const shouldRevokeTokens =
    (changes.role && changes.role.before !== changes.role.after) ||
    (changes.status && changes.status.after === 'inactive') ||
    (changes.status && changes.status.before === 'active' && changes.status.after !== 'active');

  if (shouldRevokeTokens) {
    const revoked = await revokeUserTokens(user._id, 'User role or status changed by admin', req);
    result.revokedCount = revoked.revokedCount;
  }

  /* Notify the affected user of the change. */
  try {
    const changeDescriptions = [];
    if (changes.role) changeDescriptions.push(`role: ${changes.role.before} → ${changes.role.after}`);
    if (changes.status) changeDescriptions.push(`status: ${changes.status.before} → ${changes.status.after}`);
    if (changes.department) changeDescriptions.push(`department: ${changes.department.before} → ${changes.department.after}`);
    if (changes.manager) changeDescriptions.push(`manager: ${changes.manager.before || 'none'} → ${changes.manager.after || 'none'}`);

    if (changeDescriptions.length > 0) {
      await createNotification({
        user: user._id,
        type: 'account.changed',
        title: 'Account updated',
        message: `Your account has been updated: ${changeDescriptions.join('; ')}.`,
        relatedEntity: { type: 'User', id: user._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { changedBy: req.user ? String(req.user._id) : undefined },
        session,
      });
      result.notified = true;
    }
  } catch (err) {
    console.error('[userService] propagateUserChange notification failed:', err.message);
  }

  return result;
}

module.exports = { revokeUserTokens, enforceTokenLimit, propagateUserChange, MAX_ACTIVE_TOKENS_PER_USER };
