'use strict';
const mongoose = require('mongoose');

const salaryStructureSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  basic: { type: Number, default: 0, min: 0 },
  hra: { type: Number, default: 0, min: 0 },
  allowances: {
    type: Map,
    of: Number,
    default: {},
  },
  deductions: {
    type: Map,
    of: Number,
    default: {},
  },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

salaryStructureSchema.index({ employee: 1, effectiveFrom: 1 });
salaryStructureSchema.index({ employee: 1, isActive: 1 });

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);