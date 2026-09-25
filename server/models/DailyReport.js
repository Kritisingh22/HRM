/* DailyReport — employee daily work report / task tracker.
 *  - Linked to Employee (not User) for HR-scoped visibility
 *  - Status: Draft, Submitted, Reviewed, Overdue
 *  - Each employee can have at most one report per date (enforced by unique index) */
const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    date: { type: Date, required: true, index: true },
    tasksCompleted: { type: String, trim: true },
    workDescription: { type: String, trim: true },
    status: { type: String, enum: ['Draft', 'Submitted', 'Reviewed', 'Overdue'], default: 'Draft', index: true },
    pendingWork: { type: String, trim: true },
    blockers: { type: String, trim: true },
    remarks: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
  },
  { timestamps: true }
);

// Compound unique index: one report per employee per date
dailyReportSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);