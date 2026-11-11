'use strict';
const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    level: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true },
);

designationSchema.index({ departmentId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Designation', designationSchema);
