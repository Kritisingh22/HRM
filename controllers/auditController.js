/* Audit log API — read-only. Requires audit:read (HR / ADMIN / SUPER_ADMIN).
 * Supports filtering by actor, action, targetId and a date range, newest first.
 * There is deliberately no create/update/delete endpoint — the trail is written
 * only by the server (utils/audit.js) and is immutable through the API. */
const AuditLog = require('../models/AuditLog');
const catchAsync = require('../utils/catchAsync');

/* GET /api/audit */
exports.list = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.actor) filter.actor = req.query.actor;
  if (req.query.actorRole) filter.actorRole = req.query.actorRole;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.targetId) filter.targetId = String(req.query.targetId);
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json({ count: logs.length, logs });
});

module.exports = exports;
