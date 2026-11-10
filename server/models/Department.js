'use strict';
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, trim: true, index: true },
    headUserId: { type: String, trim: true, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Department', departmentSchema);
