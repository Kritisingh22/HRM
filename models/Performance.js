/* Performance — a review record for an employee in a cycle. */
const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  weightage: { type: Number, default: 0 },
  target: { type: String },
  achieved: { type: String },
  status: { type: String, enum: ['Not Started', 'In Progress', 'Achieved', 'Partially Achieved'], default: 'In Progress' }
}, { _id: true });

const performanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    cycle: { type: String, required: true, index: true }, // e.g. '2026-H1'
    goals: { type: [goalSchema], default: [] },
    rating: { type: Number, min: 1, max: 5 },
    managerFeedback: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Draft', 'Submitted', 'Finalized'], default: 'Draft', index: true }
  },
  { timestamps: true }
);
performanceSchema.index({ employee: 1, cycle: 1 }, { unique: true });

module.exports = mongoose.model('Performance', performanceSchema);
