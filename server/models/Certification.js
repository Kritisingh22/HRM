'use strict';
const mongoose = require('mongoose');

const certificationSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 255 },
  issuer: { type: String, trim: true, maxlength: 255 },
  issueDate: { type: Date, required: true },
  expiryDate: { type: Date },
  certificateFileKey: { type: String },
  credentialId: { type: String, trim: true, maxlength: 100 },
  credentialUrl: { type: String, trim: true, maxlength: 500 },

  // ---- certificate file bookkeeping (bytes live in the configured provider) ----
  certificateOriginalName: { type: String, trim: true, maxlength: 255 },
  certificateMimeType: { type: String, maxlength: 100 },
  certificateSize: { type: Number, min: 0 },
  storageProvider: { type: String, enum: ['local', 'google-drive'], default: 'local' },
  driveFileId: { type: String },                  // Google Drive file ID (internal only)
  checksum: { type: String },                     // sha256 of the bytes
}, {
  timestamps: true,
});

certificationSchema.index({ employee: 1 });
certificationSchema.index({ employee: 1, expiryDate: 1 });
certificationSchema.index({ driveFileId: 1 }, { sparse: true });

module.exports = mongoose.model('Certification', certificationSchema);
