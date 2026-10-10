'use strict';
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, maxlength: 100 },
  title: { type: String, required: true, maxlength: 255 },
  message: { type: String, required: true },
  relatedEntityType: { type: String, maxlength: 100 },
  relatedEntityId: { type: mongoose.Schema.Types.ObjectId },
  channels: { type: Map, of: Boolean, default: { inApp: true, email: false } },
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
});

notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ relatedEntityType: 1, relatedEntityId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);