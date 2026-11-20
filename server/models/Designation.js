'use strict';
const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Lowercase-normalised copy of `name` for case-insensitive duplicate checks. */
    nameLower: { type: String, trim: true, index: true },
    description: { type: String, trim: true, default: '' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    level: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true },
);

/* Normalise the name before every save so duplicate validation is
   case-insensitive within the same department. */
designationSchema.pre('save', function (next) {
  if (this.isModified('name') && this.name) {
    this.nameLower = String(this.name).trim().toLowerCase();
  }
  next();
});

/* Compound index: no two designations in the same department may share a
   normalised name. The sparse option lets the index build even if a stray
   document is missing nameLower during migration. */
designationSchema.index(
  { departmentId: 1, nameLower: 1 },
  { unique: true, sparse: true },
);

module.exports = mongoose.model('Designation', designationSchema);
