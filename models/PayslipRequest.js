/* Payslip Request — employee-initiated requests for missing/incorrect payslips. */
const mongoose = require('mongoose');

const payslipRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    period: { type: String, required: true, index: true }, // 'YYYY-MM'
    payslip: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll' }, // reference to existing payslip if correcting
    type: { type: String, enum: ['Missing', 'Incorrect', 'Reissue', 'Other'], required: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'Resolved', 'Cancelled'], default: 'Pending', index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true },
    resolvedPayslip: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll' }, // the payslip that resolved this request
  },
  { timestamps: true }
);

payslipRequestSchema.index({ employee: 1, period: 1, status: 1 });

module.exports = mongoose.model('PayslipRequest', payslipRequestSchema);