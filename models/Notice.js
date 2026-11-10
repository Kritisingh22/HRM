/* Notice — a company announcement for the Notice Board. */
const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: { type: String, enum: ['all', 'managers', 'hr'], default: 'all', index: true },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Published', index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
