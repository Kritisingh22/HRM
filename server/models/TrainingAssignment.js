'use strict';
const mongoose = require('mongoose');

const trainingAssignmentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  training: { type: mongoose.Schema.Types.ObjectId, ref: 'Training', required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'],
    default: 'NOT_STARTED',
    index: true,
  },
  completedAt: { type: Date },
  certificateFileKey: { type: String },
}, {
  timestamps: true,
});

trainingAssignmentSchema.index({ employee: 1, training: 1 }, { unique: true });
trainingAssignmentSchema.index({ employee: 1, status: 1 });
trainingAssignmentSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model('TrainingAssignment', trainingAssignmentSchema);