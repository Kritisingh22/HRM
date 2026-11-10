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

  // ---- object storage bookkeeping (bytes live in the provider, never here) ----
  storageProvider: { type: String, enum: ['local', 'google-drive'], default: 'local' },
  driveFileId: { type: String },                  // Google Drive file ID (internal only)
  driveFolderId: { type: String },
  checksum: { type: String },                     // sha256 of the bytes
  uploadStatus: { type: String, enum: ['active', 'missing', 'deleted'], default: 'active', index: true },
  deletedAt: { type: Date },
  retention: { type: String, enum: ['standard', 'retain'], default: 'standard' },
  uploaderRole: { type: String },                 // role snapshot at upload time
  relatedModel: { type: String },                 // e.g. 'Payroll' for archived payslips
  relatedId: { type: mongoose.Schema.Types.ObjectId },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      delete ret.fileKey;
      delete ret.driveFileId;
      delete ret.driveFolderId;
      delete ret.checksum;
      return ret;
    },
  },
});

employeeDocumentSchema.index({ employee: 1, category: 1 });
employeeDocumentSchema.index({ employee: 1, createdAt: -1 });
employeeDocumentSchema.index({ uploadStatus: 1, createdAt: -1 });
employeeDocumentSchema.index({ driveFileId: 1 }, { sparse: true });
employeeDocumentSchema.index({ relatedModel: 1, relatedId: 1 }, { sparse: true });

module.exports = mongoose.model('EmployeeDocument', employeeDocumentSchema);
