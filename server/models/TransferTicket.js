/* TransferTicket — Manager-initiated employee transfer request with multi-step approval.
 * 
 * Workflow:
 * 1. Requesting Manager creates ticket (employee currently assigned to another Manager/HR)
 * 2. Current Manager reviews: Approve/Reject
 * 3. Current HR reviews: Approve/Reject
 * 4. Target HR reviews: Approve/Reject
 * 5. Target Manager reviews: Approve/Reject
 * 6. On final approval, employee's primary HR and Manager assignments are updated
 * 
 * If current and target HR are same person, skip duplicate step.
 * If current and target Manager are same person, skip duplicate step.
 */
const mongoose = require('mongoose');

const approvalStepSchema = new mongoose.Schema({
  step: {
    type: String,
    enum: [
      'Pending Current Manager Approval',
      'Pending Current HR Approval',
      'Pending Target HR Approval',
      'Pending Target Manager Approval',
      'Approved',
      'Rejected',
      'Cancelled',
      'Completed'
    ],
    required: true
  },
  approverRole: {
    type: String,
    enum: ['MANAGER', 'HR'],
    required: true
  },
  approverType: {
    type: String,
    enum: ['current', 'target'],
    required: true
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who needs to act
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt: { type: Date },
  decision: { type: String, enum: ['Approved', 'Rejected'] },
  reason: { type: String, trim: true }, // required for rejection
  isSkipped: { type: Boolean, default: false }, // when current==target
}, { _id: true, timestamps: true });

const transferTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true, index: true },
  
  // Employee being transferred
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  
  // Current assignments
  currentManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  currentHr: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  currentManagerEmployeeId: { type: String, required: true, trim: true },
  currentHrEmployeeId: { type: String, required: true, trim: true },
  
  // Target assignments
  targetManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetHr: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetManagerEmployeeId: { type: String, required: true, trim: true },
  targetHrEmployeeId: { type: String, required: true, trim: true },
  
  // Request details
  reason: { type: String, required: true, trim: true },
  businessJustification: { type: String, trim: true },
  requestedEffectiveDate: { type: Date, required: true },
  supportingDocument: { type: String, trim: true }, // file path or URL if supported
  
  // Requester
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByRole: { type: String, enum: ['MANAGER'], default: 'MANAGER' },
  
  // Approval workflow
  currentStep: {
    type: String,
    enum: [
      'Pending Current Manager Approval',
      'Pending Current HR Approval',
      'Pending Target HR Approval',
      'Pending Target Manager Approval',
      'Approved',
      'Rejected',
      'Cancelled',
      'Completed'
    ],
    default: 'Pending Current Manager Approval',
    index: true
  },
  
  approvalSteps: { type: [approvalStepSchema], default: [] },
  
  // Final status
  status: {
    type: String,
    enum: [
      'Pending Current Manager Approval',
      'Pending Current HR Approval',
      'Pending Target HR Approval',
      'Pending Target Manager Approval',
      'Approved',
      'Rejected',
      'Cancelled',
      'Completed'
    ],
    default: 'Pending Current Manager Approval',
    index: true
  },
  
  // Timestamps for completion
  approvedAt: { type: Date },
  completedAt: { type: Date },
  rejectedAt: { type: Date },
  cancelledAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, trim: true },
  cancellationReason: { type: String, trim: true },
  
  // History/audit
  history: [{
    action: { type: String, required: true, trim: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedByRole: { type: String, enum: ['MANAGER', 'HR', 'EMPLOYEE'], required: true },
    timestamp: { type: Date, default: Date.now },
    details: { type: String, trim: true },
    fromStatus: { type: String },
    toStatus: { type: String },
  }],
  
}, { timestamps: true });

// Auto-generate ticket number
transferTicketSchema.pre('validate', async function(next) {
  if (!this.ticketNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.ticketNumber = `XFR-${year}${month}${day}-${random}`;
  }
  next();
});

// Indexes for common queries
transferTicketSchema.index({ currentManager: 1, status: 1 });
transferTicketSchema.index({ currentHr: 1, status: 1 });
transferTicketSchema.index({ targetManager: 1, status: 1 });
transferTicketSchema.index({ targetHr: 1, status: 1 });
transferTicketSchema.index({ requestedBy: 1, status: 1 });
transferTicketSchema.index({ employee: 1, status: 1 });
transferTicketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TransferTicket', transferTicketSchema);