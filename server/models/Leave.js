'use strict';
const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    applicantUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    applicantRole: { type: String, enum: ['Employee', 'HR', 'Manager', 'Admin', 'Super Admin'], required: true, index: true },
    type: { type: String, enum: ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'], required: true, index: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    halfDay: { type: Boolean, default: false },
    reason: { type: String, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending', index: true },
    // Centralized approval: who has authority to approve this request.
    // 'Manager' means the employee's direct manager; 'HR' means HR department; 
    // 'Admin' and 'Super Admin' use centralized approval queue.
    approvalAuthority: { 
      type: String, 
      enum: ['Manager', 'HR', 'Admin', 'Super Admin'], 
      default: 'Manager', 
      index: true 
    },
    // For Manager approvals: link to the manager's employee record
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    // For Admin/Super Admin centralized approvals: 
    // tracks the current designated approver
    designatedApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    designatedApproverRole: { type: String, enum: ['HR', 'Admin', 'Super Admin'], default: null },
    // Audit trail of the final decision
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date }, // when the request was approved/rejected/cancelled
    // Balance bookkeeping: whether leave days were already deducted from the
    // employee's balance (prevents duplicate deduction on re-approval), and
    // whether the balance was restored after cancelling an approved request.
    balanceDeducted: { type: Boolean, default: false },
    balanceRestored: { type: Boolean, default: false },
    appliedOn: { type: Date, default: Date.now }
  },
  { timestamps: true },
);

leaveSchema.index({ employee: 1, status: 1 });
leaveSchema.index({ from: 1, to: 1 });

module.exports = mongoose.model('Leave', leaveSchema);