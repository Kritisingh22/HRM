/* TeamTask — a standalone task for team collaboration, independent of projects.
 * Supports calendar views, assignments, priorities, statuses, reminders, and history. */
const mongoose = require('mongoose');

const taskHistorySchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true }, // e.g., 'created', 'updated', 'status_changed', 'assigned', 'completed'
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedAt: { type: Date, default: Date.now },
  details: { type: String, trim: true }, // e.g., "Status changed from 'To Do' to 'In Progress'"
  field: { type: String, trim: true }, // field that changed
  oldValue: { type: String, trim: true },
  newValue: { type: String, trim: true },
}, { _id: true, timestamps: false });

const reminderSchema = new mongoose.Schema({
  sentAt: { type: Date },
  type: { type: String, enum: ['deadline_approaching', 'overdue', 'assigned', 'due_today', 'due_tomorrow'], required: true },
  sentTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { _id: true, timestamps: false });

const teamTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true },
  status: {
    type: String,
    enum: ['To Do', 'In Progress', 'In Review', 'Blocked', 'Completed', 'Cancelled'],
    default: 'To Do',
    index: true,
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent', 'Critical'],
    default: 'Medium',
    index: true,
  },
  // Dates
  startDate: { type: Date },
  dueDate: { type: Date, index: true },
  completedAt: { type: Date },
  // Assignment
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Optional project association (optional link to existing project)
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  // Team/category for filtering
  team: { type: String, trim: true, index: true }, // e.g., 'engineering', 'hr', 'marketing'
  // Tags for additional categorization
  tags: [{ type: String, trim: true }],
  // Priority and status metadata
  estimatedHours: { type: Number, min: 0 },
  actualHours: { type: Number, min: 0 },
  // Reminders
  reminders: [reminderSchema],
  // History
  history: [taskHistorySchema],
  // Soft delete
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

teamTaskSchema.index({ dueDate: 1, status: 1 });
teamTaskSchema.index({ assignedTo: 1, status: 1 });
teamTaskSchema.index({ team: 1, status: 1 });
teamTaskSchema.index({ createdBy: 1 });
teamTaskSchema.index({ deletedAt: 1 });

// Pre-save middleware to handle completedAt
teamTaskSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'Completed' && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== 'Completed') {
      this.completedAt = undefined;
    }
  }
  next();
});

// Method to add history entry
teamTaskSchema.methods.addHistory = function(action, performedBy, details = {}) {
  this.history.push({
    action,
    performedBy,
    details: details.details || '',
    field: details.field || '',
    oldValue: details.oldValue || '',
    newValue: details.newValue || '',
  });
};

// Method to check if reminder was already sent
teamTaskSchema.methods.hasReminderSent = function(type, sentTo) {
  return this.reminders.some(r => 
    r.type === type && 
    r.sentTo.some(id => id.toString() === sentTo.toString())
  );
};

// Method to add reminder
teamTaskSchema.methods.addReminder = function(type, sentTo) {
  this.reminders.push({
    sentAt: new Date(),
    type,
    sentTo: Array.isArray(sentTo) ? sentTo : [sentTo],
  });
};

module.exports = mongoose.model('TeamTask', teamTaskSchema);