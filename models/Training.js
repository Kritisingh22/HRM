'use strict';
const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 255 },
  description: { type: String, trim: true },
  category: { type: String, trim: true, maxlength: 100 },
  durationHours: { type: Number, default: 0, min: 0 },
  isMandatory: { type: Boolean, default: false },
  validityMonths: { type: Number, min: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

trainingSchema.index({ isActive: 1, category: 1 });

module.exports = mongoose.model('Training', trainingSchema);