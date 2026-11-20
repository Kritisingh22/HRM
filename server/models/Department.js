'use strict';
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Lowercase-normalised copy of `name` for case-insensitive duplicate checks. */
    nameLower: { type: String, trim: true, index: true, unique: true, sparse: true },
    description: { type: String, trim: true, default: '' },
    code: { type: String, trim: true, index: true },
    headUserId: { type: String, trim: true, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true },
);

/* Normalise the name before every save so duplicate validation is
   case-insensitive and whitespace-tolerant. */
departmentSchema.pre('save', function (next) {
  if (this.isModified('name') && this.name) {
    this.nameLower = String(this.name).trim().toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Department', departmentSchema);
