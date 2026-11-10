'use strict';
const mongoose = require('mongoose');

const workCalendarPolicySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
  },
  oddSaturdaysOff: {
    type: Boolean,
    default: true,
  },
  workingDaysPerWeek: {
    type: Number,
    default: 5,
    min: 1,
    max: 7,
  },
  standardHoursPerDay: {
    type: Number,
    default: 8.0,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  effectiveFrom: {
    type: Date,
    required: true,
  },
  effectiveTo: {
    type: Date,
  },
}, {
  timestamps: true,
});

workCalendarPolicySchema.index({ isActive: 1, effectiveFrom: 1 });

module.exports = mongoose.model('WorkCalendarPolicy', workCalendarPolicySchema);