/* Requirement — a manager's request for new hires/team expansion.
 *  - Created by Manager for their team
 *  - Reviewed/managed by HR
 *  - Status workflow: Pending -> Under Review -> Approved / Rejected / On Hold */
const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    department: { type: String, trim: true },
    team: { type: String, trim: true }, // manager's team identifier
    requiredCount: { type: Number, default: 1, min: 1 },
    skills: { type: String, trim: true }, // comma-separated skills/requirements
    priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
    requestedDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'On Hold'], default: 'Pending', index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
    // Link to hiring job if created
    linkedJob: { type: mongoose.Schema.Types.ObjectId, ref: 'Hiring' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Requirement', requirementSchema);