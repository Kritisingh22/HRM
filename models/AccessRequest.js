/* AccessRequest — lets one HR request access to an employee assigned to a
 * different HR, instead of ever being able to see/act on that employee by
 * default. Supports a temporary grant (durationDays set → auto-expires) or a
 * permanent transfer request (isTransfer: true → on approval, updates the
 * employee's assignedHrId instead of granting a time-boxed exception).
 * Approved + not-yet-expired requests are read by utils/teamScope.js, which
 * is the single place that decides "which employees can this user see" — so
 * this is the one thing that needs to change for the whole app (employees,
 * leave, payroll, documents, reports, …) to honor a granted access. */
const mongoose = require('mongoose');

const accessRequestSchema = new mongoose.Schema(
  {
    requestingHrId: { type: String, required: true, trim: true, index: true }, // employeeId of the HR asking
    currentHrId: { type: String, required: true, trim: true, index: true },    // employeeId of the HR who owns the employee today
    employeeId: { type: String, required: true, trim: true, index: true },

    modules: { type: [String], default: [] },   // e.g. ['leave', 'documents']
    actions: { type: [String], default: ['read'] },
    reason: { type: String, trim: true },

    isTransfer: { type: Boolean, default: false }, // true = permanent reassignment request
    durationDays: { type: Number, default: null },  // null for a transfer request
    expiresAt: { type: Date, default: null },        // set on approval for temporary grants

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Expired', 'Revoked'],
      default: 'Pending',
      index: true
    },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true }
  },
  { timestamps: true }
);

accessRequestSchema.index({ currentHrId: 1, status: 1 });
accessRequestSchema.index({ requestingHrId: 1, status: 1 });
accessRequestSchema.index({ employeeId: 1, status: 1 });

// A request currently grants live access: Approved, a transfer (one-time, not
// re-checked after the assignedHrId update happens), or Approved-temporary and
// not yet past expiresAt.
accessRequestSchema.methods.isLiveGrant = function () {
  if (this.status !== 'Approved') return false;
  if (this.isTransfer) return false; // transfers act once, via assignedHrId — not an ongoing grant
  if (!this.expiresAt) return true;
  return this.expiresAt.getTime() > Date.now();
};

module.exports = mongoose.model('AccessRequest', accessRequestSchema);
