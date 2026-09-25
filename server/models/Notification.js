/* Notification — individual user notifications (reminders, alerts, etc.).
 *  Distinct from Notice which is for company-wide announcements.
 *  Each notification is tied to a specific user and can track read status. */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, trim: true, index: true }, // e.g., 'Daily Report Reminder', 'Leave Approved'
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // Reference to related entity (optional)
    relatedEntity: {
      type: { type: String, enum: ['DailyReport', 'Leave', 'Payroll', 'Document', 'Task', 'Other'] },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
    // Delivery channels
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      emailSent: { type: Boolean, default: false },
      emailSentAt: { type: Date },
    },
    // Status tracking
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    // For reminders - track if this is a reminder and for which date
    reminderForDate: { type: Date, index: true },
    // Priority for UI display
    priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
    // Metadata
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Compound index for efficient reminder deduplication queries
notificationSchema.index({ user: 1, type: 1, reminderForDate: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);