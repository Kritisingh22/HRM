/* Payroll — one payslip per employee per period. */
const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    period: { type: String, required: true, index: true }, // 'YYYY-MM'
    gross: { type: Number, required: true, default: 0, min: 0 },
    deductions: {
      pf: { type: Number, default: 0, min: 0 },
      tds: { type: Number, default: 0, min: 0 },
      esi: { type: Number, default: 0, min: 0 },
      other: { type: Number, default: 0, min: 0 }
    },
    net: { type: Number, default: 0, min: 0 }, // rejects a payslip whose deductions exceed gross
    status: { type: String, enum: ['Draft', 'Approved', 'Processed', 'Paid'], default: 'Draft', index: true },
<<<<<<< HEAD
    payDate: { type: Date }
=======
    payDate: { type: Date },
    // Payment transaction details for payslip
    paymentMode: { type: String, trim: true }, // e.g., 'Bank Transfer', 'Cash', 'Cheque'
    transactionId: { type: String, trim: true },
    reference: { type: String, trim: true },
    utr: { type: String, trim: true }
>>>>>>> 0f31467 (intial Update HRM 1.1)
  },
  { timestamps: true }
);

payrollSchema.index({ employee: 1, period: 1 }, { unique: true });

// keep net in sync — computed in pre('validate') (BEFORE validation) so the
// net:{min:0} rule can reject a payslip whose deductions exceed gross.
payrollSchema.pre('validate', function (next) {
  const d = this.deductions || {};
  this.net = (this.gross || 0) - ((d.pf || 0) + (d.tds || 0) + (d.esi || 0) + (d.other || 0));
  next();
});

module.exports = mongoose.model('Payroll', payrollSchema);
