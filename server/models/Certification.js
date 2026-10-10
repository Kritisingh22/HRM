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
}, {
  timestamps: true,
});

certificationSchema.index({ employee: 1 });
certificationSchema.index({ employee: 1, expiryDate: 1 });

module.exports = mongoose.model('Certification', certificationSchema);