/* Transfer — employee transfer, department change, or role change record.
 *  - Tracks organizational changes with approval workflow
 *  - Types: Transfer, Department Change, Promotion, Demotion, Role Change
 *  - HR creates, Manager/Employee notified */
const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    type: { type: String, enum: ['Transfer', 'Department Change', 'Promotion', 'Demotion', 'Role Change', 'Location Change'], required: true },
    // From values (current state)
    fromDepartment: { type: String, trim: true },
    fromDesignation: { type: String, trim: true },
    fromLocation: { type: String, trim: true },
    fromManager: { type: String, trim: true }, // employeeId of previous manager
    // To values (new state)
    toDepartment: { type: String, trim: true },
    toDesignation: { type: String, trim: true },
    toLocation: { type: String, trim: true },
    toManager: { type: String, trim: true }, // employeeId of new manager
    // Additional info
    reason: { type: String, trim: true },
    effectiveDate: { type: Date, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Implemented'], default: 'Pending', index: true },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    implementedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    implementedAt: { type: Date },
    approvalNote: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transfer', transferSchema);