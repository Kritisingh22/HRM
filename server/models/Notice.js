/* Notice — a company announcement for the Notice Board.

   Audience can be 'all' | 'department' | 'role' | 'specific' | 'managers' | 'hr'.
   When audience is 'department', 'role', or 'specific', the corresponding
   ID arrays are used to resolve recipients. startDate / expiryDate control
   visibility window (additive, backwards compatible).
 */
const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: {
      type: String,
      enum: ['all', 'department', 'role', 'specific', 'managers', 'hr'],
      default: 'all',
      index: true,
    },
    /* Department IDs (names or ObjectIds) when audience === 'department'. */
    audienceDepartments: { type: [String], default: [] },
    /* Role names when audience === 'role'. */
    audienceRoles: { type: [String], default: [] },
    /* User ObjectIds when audience === 'specific'. */
    audienceUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    /* Visibility window. */
    startDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: ['Draft', 'Published', 'Expired'], default: 'Published', index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* TTL: auto-expire notices past their expiryDate. */
noticeSchema.index(
  { expiryDate: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiryDate: { $exists: true, $ne: null } } }
);
noticeSchema.index({ audience: 1, status: 1 });
noticeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notice', noticeSchema);
