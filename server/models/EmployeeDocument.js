'use strict';
const mongoose = require('mongoose');

const employeeDocumentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, required: true, trim: true, maxlength: 100 },
  category: {
    type: String,
    enum: ['personal', 'company', 'hr_manual', 'onsite_manual', 'policy', 'contract', 'payslip', 'id_proof', 'certificate', 'other'],
    default: 'personal',
  },
  fileKey: { type: String, required: true },
  originalName: { type: String, required: true, trim: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  fileSize: { type: Number, required: true, min: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
  isVerified: { type: Boolean, default: false },
  visibility: {
    type: String,
    enum: ['private', 'team', 'company', 'hr_only'],
    default: 'private',
  },
}, {
  timestamps: true,
});

employeeDocumentSchema.index({ employee: 1, category: 1 });
employeeDocumentSchema.index({ employee: 1, createdAt: -1 });

module.exports = mongoose.model('EmployeeDocument', employeeDocumentSchema);