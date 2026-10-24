/* Offboarding — an employee exit workflow. Completing it deactivates the user
 * account (in the controller) but NEVER deletes historical records. */
const mongoose = require('mongoose');

const clearanceItemSchema = new mongoose.Schema({
  item: { type: String, required: true },     // e.g. 'IT assets returned'
  done: { type: Boolean, default: false }
}, { _id: true });

const offboardingSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true, index: true },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, enum: ['Resignation', 'Termination', 'End of Contract', 'Retirement', 'Other'], default: 'Resignation' },
    resignationDate: { type: Date },
    noticePeriod: { type: String, enum: ['Immediate', '30 days', '60 days', '90 days'], default: '30 days' },
    lastWorkingDate: { type: Date },
    status: { type: String, enum: ['Initiated', 'In Progress', 'Cleared', 'Completed'], default: 'Initiated', index: true },
    clearance: {
      type: [clearanceItemSchema],
      default: () => ([
        { item: 'IT assets returned', done: false },
        { item: 'Access revoked', done: false },
        { item: 'Knowledge transfer', done: false },
        { item: 'Final settlement processed', done: false }
      ])
    },
    finalSettlementRef: { type: String },
    notes: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offboarding', offboardingSchema);
