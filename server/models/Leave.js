/* Leave — a leave request tied to an employee (and the requesting user). */
const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, enum: ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'], required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    halfDay: { type: Boolean, default: false },
    reason: { type: String, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending', index: true },
    approvalAuthority: { type: String, enum: ['Manager', 'HR'], default: 'Manager', index: true },
    managerNote: { type: String, trim: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    appliedOn: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Leave', leaveSchema);
