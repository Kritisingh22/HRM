'use strict';
const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
  },
  defaultEntitlement: {
    type: Number,
    default: 0,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

leaveTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);