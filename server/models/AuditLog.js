/* AuditLog — an append-only record of sensitive management actions (who did what,
 * to whom, when, from where). Written by utils/audit.js on privileged operations;
 * read by HR/Admin via GET /api/audit. Records are never edited or deleted through
 * the API — they are an audit trail. */
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // who performed the action
    actorName: { type: String },                 // denormalised for a stable audit trail even if the user is later renamed
    actorRole: { type: String, index: true },
    action: { type: String, required: true, index: true }, // e.g. 'user.create', 'employee.assign_manager', 'leave.approve'
    targetType: { type: String },                // e.g. 'User', 'Employee', 'Leave'
    targetId: { type: String, index: true },     // id or business key of the affected record
    description: { type: String },               // human-readable summary
    ip: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true } // createdAt is the event time
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
