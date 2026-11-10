/* Audit helper — records a sensitive management action to the AuditLog.
 *
 * Fire-and-forget by design: auditing must NEVER break or block the primary
 * operation. logAudit returns a promise but callers do not need to await it;
 * any failure is swallowed (logged to the server console) so a logging problem
 * can't fail a legitimate request. Identity, IP and user-agent are taken from
 * the authenticated request, never from client-supplied fields. */
const AuditLog = require('../models/AuditLog');

function logAudit(req, { action, targetType, targetId, description } = {}) {
  try {
    const actor = req && req.user;
    return AuditLog.create({
      actor: actor ? actor._id : undefined,
      actorName: actor ? actor.fullName : undefined,
      actorRole: actor ? actor.role : undefined,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : undefined,
      description,
      ip: req ? req.ip : undefined,
      userAgent: req && req.headers ? req.headers['user-agent'] : undefined
    }).catch((e) => { console.error('[audit] failed to write log:', e.message); });
  } catch (e) {
    console.error('[audit] logAudit error:', e.message);
    return Promise.resolve();
  }
}

module.exports = { logAudit };
