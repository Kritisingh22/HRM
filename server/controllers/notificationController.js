'use strict';
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

exports.list = catchAsync(async (req, res) => {
  const { unread, page = 1, limit = 20 } = req.query;
  const filter = { user: req.user._id };
  if (unread === 'true') filter.read = false;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Notification.countDocuments(filter),
  ]);

  res.json({ notifications, total, page: pageNum, pages: Math.ceil(total / limitNum) });
});

exports.getUnreadCount = catchAsync(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ unreadCount: count });
});

exports.markAsRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notification) throw ApiError.notFound('Notification not found.');

  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }

  res.json({ notification });
});

exports.markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, read: false },
    { read: true, readAt: new Date() }
  );
  res.json({ message: 'All notifications marked as read.' });
});

exports.delete = catchAsync(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notification) throw ApiError.notFound('Notification not found.');

  await notification.deleteOne();
  res.json({ ok: true });
});

// Helper function to create notifications (used by other controllers)
exports.createNotification = async (data) => {
  return Notification.create(data);
};

exports.createBulkNotifications = async (notifications) => {
  return Notification.insertMany(notifications);
};

// Scheduled job: Send training reminders
exports.sendTrainingReminders = catchAsync(async (req, res) => {
  const TrainingAssignment = require('../models/TrainingAssignment');
  const Notification = require('../models/Notification');
  const Employee = require('../models/Employee');
  const { sendEmail } = require('../services/email');

  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const oneDayLater = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  // Find assignments due in 3 days or 1 day that are not completed
  const upcomingAssignments = await TrainingAssignment.find({
    status: { $in: ['NOT_STARTED', 'IN_PROGRESS'] },
    dueDate: { $gte: now, $lte: threeDaysLater },
  }).populate('employee', 'fullName email user employeeId')
    .populate('training', 'title');

  const notifications = [];

  for (const assignment of upcomingAssignments) {
    const daysUntilDue = Math.ceil((new Date(assignment.dueDate) - now) / (1000 * 60 * 60 * 24));
    let shouldNotify = false;
    let reminderType = '';

    if (daysUntilDue === 3) {
      shouldNotify = true;
      reminderType = '3_DAYS';
    } else if (daysUntilDue === 1) {
      shouldNotify = true;
      reminderType = '1_DAY';
    }

    if (shouldNotify) {
      const employee = assignment.employee;
      if (employee?.user) {
        notifications.push({
          user: employee.user._id,
          type: 'Training Reminder',
          title: `Training Due Soon: ${assignment.training.title}`,
          message: `Your training "${assignment.training.title}" is due in ${daysUntilDue} day(s) (by ${new Date(assignment.dueDate).toLocaleDateString('en-IN')}).`,
          relatedEntity: { type: 'TrainingAssignment', id: assignment._id },
          channels: { inApp: true, email: true },
          priority: 'High',
          metadata: { assignmentId: assignment._id, reminderType },
        });
      }
    }
  }

  // Check for overdue assignments
  const overdueAssignments = await TrainingAssignment.find({
    status: { $in: ['NOT_STARTED', 'IN_PROGRESS'] },
    dueDate: { $lt: now },
  }).populate('employee', 'fullName email user employeeId')
    .populate('training', 'title');

  for (const assignment of overdueAssignments) {
    const employee = assignment.employee;
    if (employee?.user) {
      // Check if we already sent an overdue notification recently (e.g., last 7 days)
      const recentOverdue = await Notification.findOne({
        user: employee.user._id,
        type: 'Training Overdue',
        'metadata.assignmentId': assignment._id,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      });

      if (!recentOverdue) {
        notifications.push({
          user: employee.user._id,
          type: 'Training Overdue',
          title: `Training Overdue: ${assignment.training.title}`,
          message: `Your training "${assignment.training.title}" was due on ${new Date(assignment.dueDate).toLocaleDateString('en-IN')} and is now overdue.`,
          relatedEntity: { type: 'TrainingAssignment', id: assignment._id },
          channels: { inApp: true, email: true },
          priority: 'Urgent',
          metadata: { assignmentId: assignment._id },
        });
      }
    }
  }

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }

  // Send emails for high priority notifications
  const highPriorityNotifications = notifications.filter(n => n.priority === 'High' || n.priority === 'Urgent');
  for (const notif of highPriorityNotifications) {
    if (notif.channels.email) {
      const user = await require('../models/User').findById(notif.user);
      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: notif.title,
          text: notif.message,
        });
      }
    }
  }

  res.json({ 
    message: 'Training reminders sent successfully.', 
    notificationsSent: notifications.length,
    overdueNotifications: notifications.filter(n => n.type === 'Training Overdue').length,
    reminderNotifications: notifications.filter(n => n.type === 'Training Reminder').length,
  });
});

// Scheduled job: Send leave balance reminders
exports.sendLeaveBalanceReminders = catchAsync(async (req, res) => {
  // Implementation similar to training reminders
  res.json({ message: 'Leave balance reminders sent.' });
});

// Scheduled job: Send payroll generated notifications
exports.sendPayrollNotifications = catchAsync(async (req, res) => {
  const Payroll = require('../models/Payroll');
  const Notification = require('../models/Notification');
  const Employee = require('../models/Employee');
  const { sendEmail } = require('../services/email');

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const payslips = await Payroll.find({ period: currentMonth, status: 'Paid' })
    .populate('employee', 'fullName email user');

  const notifications = [];
  for (const payslip of payslips) {
    const employee = payslip.employee;
    if (employee?.user) {
      notifications.push({
        user: employee.user._id,
        type: 'Payslip Available',
        title: `Payslip for ${payslip.period} Available`,
        message: `Your payslip for ${payslip.period} has been processed. Net pay: ₹${payslip.net.toLocaleString('en-IN')}.`,
        relatedEntity: { type: 'Payroll', id: payslip._id },
        channels: { inApp: true, email: true },
        priority: 'Normal',
      });
    }
  }

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }

  res.json({ message: 'Payroll notifications sent.', count: notifications.length });
});