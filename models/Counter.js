'use strict';
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g., 'employee:Engineering:100'
    seq: { type: Number, default: 0 },
  },
  { timestamps: false }
);

module.exports = mongoose.model('Counter', counterSchema);