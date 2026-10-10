'use strict';
const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    salaryStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure' },
    period: { type: String, required: true, index: true }, // 'YYYY-MM'
    gross: { type: Number, required: true, default: 0, min: 0 },
    deductions: {
      pf: { type: Number, default: 0, min: 0 },
      tds: { type: Number, default: 0, min: 0 },
      esi: { type: Number, default: 0, min: 0 },
      other: { type: Number, default: 0, min: 0 },
    },
    net: { type: Number, default: 0, min: 0 }, // rejects a payslip whose deductions exceed gross
    status: { type: String, enum: ['Draft', 'Approved', 'Processed', 'Paid'], default: 'Draft', index: true },
    payDate: { type: Date },
    // Payment transaction details for payslip
    paymentMode: { type: String, trim: true }, // e.g., 'Bank Transfer', 'Cash', 'Cheque'
    transactionId: { type: String, trim: true },
    reference: { type: String, trim: true },
    utr: { type: String, trim: true },
    // For regenerated/corrected payslips
    originalPayslip: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll' },
    correctionReason: { type: String, trim: true },
  },
  { timestamps: true },
);

payrollSchema.index({ employee: 1, period: 1 }, { unique: true });
payrollSchema.index({ period: 1, status: 1 });
payrollSchema.index({ employee: 1, status: 1 });

// keep net in sync — computed in pre('validate') (BEFORE validation) so the
// net:{min:0} rule can reject a payslip whose deductions exceed gross.
payrollSchema.pre('validate', function (next) {
  const d = this.deductions || {};
  this.net = (this.gross || 0) - ((d.pf || 0) + (d.tds || 0) + (d.esi || 0) + (d.other || 0));
  next();
});

module.exports = mongoose.model('Payroll', payrollSchema);