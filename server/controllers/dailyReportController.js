/* DailyReport API — role-scoped daily task tracker.
 *  - EMPLOYEE: create/submit own reports, view own history, edit drafts
 *  - MANAGER: view team reports, review submitted reports, monitor pending/missing
 *  - HR/ADMIN/SUPER_ADMIN: view all reports, review any, monitor org-wide */
const DailyReport = require('../models/DailyReport');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { sendDailyReportReminder, sendDailyReportSubmitted, sendDailyReportReviewed } = require('../services/emailService');
const cfg = require('../config/env');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
const REVIEWER_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'];

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

async function teamEmployeeIds(user) {
  const team = await Employee.find({ manager: user.employeeId }).select('_id');
  return team.map((e) => e._id);
}

function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfDay(d) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

/* GET /api/daily-reports
 * Query params: date (YYYY-MM-DD), from, to, status, employee (HR only) */
exports.list = catchAsync(async (req, res) => {
  let filter = {};
  const { date, from, to, status, employee } = req.query;

  if (SEES_ALL.includes(req.user.role)) {
    if (employee) filter.employee = employee;
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    const me = await myEmployee(req.user);
    if (me) ids.push(me._id);
    filter.employee = { $in: ids };
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }

  if (date) {
    const d = startOfDay(date);
    filter.date = { $gte: d, $lte: endOfDay(d) };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(from);
    if (to) filter.date.$lte = endOfDay(to);
  }
  if (status) filter.status = status;

  const reports = await DailyReport.find(filter)
    .populate('employee', 'employeeId fullName department designation')
    .populate('submittedBy', 'fullName email')
    .populate('reviewedBy', 'fullName email')
    .sort({ date: -1, createdAt: -1 })
    .limit(500);

  res.json({ count: reports.length, reports });
});

/* GET /api/daily-reports/summary — for dashboard/manager view
 * Returns counts by status for the scoped team/org */
exports.summary = catchAsync(async (req, res) => {
  let filter = {};

  if (SEES_ALL.includes(req.user.role)) {
    filter = {};
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    const me = await myEmployee(req.user);
    if (me) ids.push(me._id);
    filter.employee = { $in: ids };
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }

  // Default to last 7 days if no date range
  const to = req.query.to ? endOfDay(req.query.to) : endOfDay(new Date());
  const from = req.query.from ? startOfDay(req.query.from) : startOfDay(new Date(Date.now() - 6 * 86400000));
  filter.date = { $gte: from, $lte: to };

  const reports = await DailyReport.find(filter).select('status');

  const summary = {
    total: reports.length,
    draft: reports.filter((r) => r.status === 'Draft').length,
    submitted: reports.filter((r) => r.status === 'Submitted').length,
    reviewed: reports.filter((r) => r.status === 'Reviewed').length,
    overdue: reports.filter((r) => r.status === 'Overdue').length,
  };

  res.json({ summary, range: { from, to } });
});

/* GET /api/daily-reports/missing — employees who haven't submitted for a date range
 * Only for MANAGER/HR to monitor missing submissions */
exports.missing = catchAsync(async (req, res) => {
  if (!REVIEWER_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to view missing reports.');
  }

  let employeeIds = [];
  if (SEES_ALL.includes(req.user.role)) {
    const emps = await Employee.find({ status: 'Active' }).select('_id');
    employeeIds = emps.map((e) => e._id);
  } else if (req.user.role === 'MANAGER') {
    employeeIds = await teamEmployeeIds(req.user);
    const me = await myEmployee(req.user);
    if (me) employeeIds.push(me._id);
  } else {
    throw ApiError.forbidden('You do not have permission to view missing reports.');
  }

  const to = req.query.to ? endOfDay(req.query.to) : endOfDay(new Date());
  const from = req.query.from ? startOfDay(req.query.from) : startOfDay(new Date(Date.now() - 6 * 86400000));

  // Get all reports in range for these employees
  const existing = await DailyReport.find({
    employee: { $in: employeeIds },
    date: { $gte: from, $lte: to },
  }).select('employee date status');

  // Build a set of submitted (Submitted or Reviewed) employee-date pairs
  const submittedPairs = new Set();
  for (const r of existing) {
    if (r.status === 'Submitted' || r.status === 'Reviewed') {
      const key = String(r.employee) + '|' + r.date.toISOString().split('T')[0];
      submittedPairs.add(key);
    }
  }

  // Get employee details for missing
  const employees = await Employee.find({ _id: { $in: employeeIds }, status: 'Active' })
    .select('employeeId fullName department designation manager')
    .populate('manager', 'employeeId fullName');

  // Find missing dates per employee
  const missing = [];
  for (const emp of employees) {
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      const key = String(emp._id) + '|' + dateKey;
      if (!submittedPairs.has(key)) {
        missing.push({
          employee: {
            _id: emp._id,
            employeeId: emp.employeeId,
            fullName: emp.fullName,
            department: emp.department,
            designation: emp.designation,
            manager: emp.manager,
          },
          date: dateKey,
        });
      }
    }
  }

  res.json({ count: missing.length, missing });
});

/* POST /api/daily-reports — employee creates/submits own report
 * HR/Admin can also create for others if needed */
exports.create = catchAsync(async (req, res) => {
  let employeeId = req.body.employee;

  // Determine target employee
  if (!employeeId || !SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    if (!me) throw ApiError.badRequest('No employee record linked to your account.');
    employeeId = me._id;
  }

  const date = req.body.date ? startOfDay(req.body.date) : startOfDay(new Date());

  // Check if report already exists
  const existing = await DailyReport.findOne({ employee: employeeId, date });
  if (existing) {
    if (existing.status !== 'Draft') {
      throw ApiError.badRequest('A report for this date already exists and cannot be edited.');
    }
    // Update existing draft
    existing.tasksCompleted = req.body.tasksCompleted || '';
    existing.workDescription = req.body.workDescription || '';
    existing.pendingWork = req.body.pendingWork || '';
    existing.blockers = req.body.blockers || '';
    existing.remarks = req.body.remarks || '';
    existing.status = req.body.status || 'Draft';
    if (req.body.status === 'Submitted') {
      existing.submittedBy = req.user._id;
    }
    await existing.save();
    return res.json({ report: existing, updated: true });
  }

  const report = await DailyReport.create({
    employee: employeeId,
    submittedBy: req.user._id,
    date,
    tasksCompleted: req.body.tasksCompleted || '',
    workDescription: req.body.workDescription || '',
    status: req.body.status || 'Draft',
    pendingWork: req.body.pendingWork || '',
    blockers: req.body.blockers || '',
    remarks: req.body.remarks || '',
  });

  // If submitted (not draft), create notification for manager and send emails
  if (report.status === 'Submitted') {
    await notifyManager(report);
    await sendSubmissionConfirmation(report);
  }

  logAudit(req, {
    action: 'daily_report.create',
    targetType: 'DailyReport',
    targetId: report._id,
    description: `Created daily report for ${date.toISOString().split('T')[0]}`,
  });

  res.status(201).json({ report, updated: false });
});

/* PUT /api/daily-reports/:id — update report (edit draft, submit, review)
 * - Employee: can edit own Draft, can submit own Draft -> Submitted
 * - Manager/HR: can review Submitted -> Reviewed with note
 * - HR/Admin: can also override status */
exports.update = catchAsync(async (req, res) => {
  const report = await DailyReport.findById(req.params.id).populate('employee', 'employeeId fullName manager');
  if (!report) throw ApiError.notFound('Daily report not found.');

  const action = req.body.status; // Draft, Submitted, Reviewed
  const isOwner = report.submittedBy && String(report.submittedBy) === String(req.user._id);
  const isReviewer = REVIEWER_ROLES.includes(req.user.role);

  // Employee actions
  if (!isReviewer && !isOwner) {
    throw ApiError.forbidden('You can only edit your own reports.');
  }

  if (!isReviewer) {
    // Employee can only edit Draft reports
    if (report.status !== 'Draft') {
      throw ApiError.badRequest('You can only edit draft reports. Submitted reports cannot be modified.');
    }
    // Employee can submit (Draft -> Submitted) or keep as Draft
    if (action && action !== 'Draft' && action !== 'Submitted') {
      throw ApiError.badRequest('Invalid status transition. Use Draft or Submitted.');
    }
    report.tasksCompleted = req.body.tasksCompleted ?? report.tasksCompleted;
    report.workDescription = req.body.workDescription ?? report.workDescription;
    report.pendingWork = req.body.pendingWork ?? report.pendingWork;
    report.blockers = req.body.blockers ?? report.blockers;
    report.remarks = req.body.remarks ?? report.remarks;
    if (action) {
      report.status = action;
      if (action === 'Submitted') {
        report.submittedBy = req.user._id;
        await notifyManager(report);
        await sendSubmissionConfirmation(report);
      }
    }
  } else {
    // Manager/HR actions
    if (req.user.role === 'MANAGER') {
      // Manager can only review their team's reports
      const isTeam = report.employee.manager === req.user.employeeId;
      if (!isTeam) throw ApiError.forbidden('You can only review reports from your team.');
    }
    // Reviewer can transition Submitted -> Reviewed
    if (action === 'Reviewed') {
      if (report.status !== 'Submitted') {
        throw ApiError.badRequest('Only submitted reports can be reviewed.');
      }
      report.status = 'Reviewed';
      report.reviewedBy = req.user._id;
      report.reviewedAt = new Date();
      report.reviewNote = req.body.reviewNote || '';
      // Send reviewed notification
      await sendReviewedNotification(report);
    } else if (action === 'Submitted' && report.status === 'Draft') {
      // Manager can submit a draft on behalf (rare)
      report.status = 'Submitted';
      report.submittedBy = req.user._id;
      await notifyManager(report);
      await sendSubmissionConfirmation(report);
    } else if (action && !['Draft', 'Submitted', 'Reviewed'].includes(action)) {
      throw ApiError.badRequest('Invalid status.');
    }
    // Allow updating content if needed (HR/Admin)
    if (SEES_ALL.includes(req.user.role)) {
      report.tasksCompleted = req.body.tasksCompleted ?? report.tasksCompleted;
      report.workDescription = req.body.workDescription ?? report.workDescription;
      report.pendingWork = req.body.pendingWork ?? report.pendingWork;
      report.blockers = req.body.blockers ?? report.blockers;
      report.remarks = req.body.remarks ?? report.remarks;
      if (action) report.status = action;
    }
  }

  await report.save();

  logAudit(req, {
    action: 'daily_report.update',
    targetType: 'DailyReport',
    targetId: report._id,
    description: `Updated daily report: status=${report.status}`,
  });

  res.json({ report });
});

/* POST /api/daily-reports/bulk-check-overdue — cron/manual trigger to mark overdue
 * Finds Draft reports older than today and marks them Overdue */
exports.markOverdue = catchAsync(async (req, res) => {
  if (!SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden('Only HR/Admin can run overdue check.');
  }

  const today = startOfDay(new Date());
  const result = await DailyReport.updateMany(
    { status: 'Draft', date: { $lt: today } },
    { $set: { status: 'Overdue' } },
  );

  res.json({ updated: result.modifiedCount });
});

/* POST /api/daily-reports/send-reminders — send reminders for missing reports
 * Creates notification records for employees/managers with missing submissions */
exports.sendReminders = catchAsync(async (req, res) => {
  if (!REVIEWER_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('Only Manager/HR can send reminders.');
  }

  let employeeIds = [];
  if (SEES_ALL.includes(req.user.role)) {
    const emps = await Employee.find({ status: 'Active' }).select('_id');
    employeeIds = emps.map((e) => e._id);
  } else if (req.user.role === 'MANAGER') {
    employeeIds = await teamEmployeeIds(req.user);
    const me = await myEmployee(req.user);
    if (me) employeeIds.push(me._id);
  }

  const date = req.body.date ? startOfDay(req.body.date) : startOfDay(new Date());
  const previousDay = new Date(date);
  previousDay.setDate(previousDay.getDate() - 1);

  // Check for missing reports on the previous day
  const existing = await DailyReport.find({
    employee: { $in: employeeIds },
    date: { $gte: startOfDay(previousDay), $lte: endOfDay(previousDay) },
    status: { $in: ['Submitted', 'Reviewed'] },
  }).select('employee');

  const submittedSet = new Set(existing.map((r) => String(r.employee)));

  const missingEmployees = await Employee.find({
    _id: { $in: employeeIds },
    status: 'Active',
    _id: { $nin: Array.from(submittedSet) },
  }).select('employeeId fullName email user manager')
    .populate('user', 'email fullName role')
    .populate('manager', 'employeeId fullName user')
    .lean();

  // Create reminder notifications
  const notifications = [];
  for (const emp of missingEmployees) {
    if (!emp.user || !emp.user.email) continue;

    // Check if reminder already sent for this employee/date (deduplication)
    const existingNotification = await Notification.findOne({
      user: emp.user._id,
      type: 'Daily Report Reminder',
      reminderForDate: previousDay,
    });

    if (existingNotification) continue;

    // Create in-app notification
    const notification = await Notification.create({
      user: emp.user._id,
      type: 'Daily Report Reminder',
      title: `Daily Report Reminder — ${previousDay.toISOString().split('T')[0]}`,
      message: `You have not submitted your daily report for ${previousDay.toISOString().split('T')[0]}. The submission deadline was ${cfg.DAILY_REPORT_DEADLINE_HOUR.toString().padStart(2, '0')}:${cfg.DAILY_REPORT_DEADLINE_MINUTE.toString().padStart(2, '0')}. Please submit it as soon as possible.`,
      relatedEntity: { type: 'DailyReport', id: null },
      channels: { inApp: true, email: !!cfg.SMTP_HOST },
      reminderForDate: previousDay,
      priority: 'High',
      metadata: { deadlineHour: cfg.DAILY_REPORT_DEADLINE_HOUR, deadlineMinute: cfg.DAILY_REPORT_DEADLINE_MINUTE, manualTrigger: true },
    });

    // Send email if configured
    if (cfg.SMTP_HOST) {
      try {
        await sendDailyReportReminder({
          toEmail: emp.user.email,
          toName: emp.fullName,
          date: previousDay,
          role: emp.user.role,
        });
        notification.channels.emailSent = true;
        notification.channels.emailSentAt = new Date();
        await notification.save();
      } catch (err) {
        console.error(`[DailyReport] Failed to send reminder email to ${emp.fullName}:`, err.message);
      }
    }

    // Escalation to manager
    if (cfg.DAILY_REPORT_ESCALATE_TO_MANAGER && emp.manager && emp.manager.user) {
      await sendEscalationNotification(emp, emp.manager, previousDay, notification._id);
    }

    // Escalation to HR (optional)
    if (cfg.DAILY_REPORT_ESCALATE_TO_HR) {
      await sendHREscalationNotification(emp, previousDay, notification._id);
    }

    notifications.push(notification);
  }

  res.json({ remindersSent: notifications.length, date: previousDay.toISOString().split('T')[0] });
});

async function sendEscalationNotification(employee, manager, date, originalNotificationId) {
  if (!manager.user || !manager.user.email) return;

  const existing = await Notification.findOne({
    user: manager.user._id,
    type: 'Daily Report Escalation',
    reminderForDate: date,
    'metadata.employeeId': employee.employeeId,
  });

  if (existing) return;

  const notification = await Notification.create({
    user: manager.user._id,
    type: 'Daily Report Escalation',
    title: `Daily Report Missing — ${employee.fullName} (${employee.employeeId})`,
    message: `The daily report for ${employee.fullName} (${employee.employeeId}) for ${date.toISOString().split('T')[0]} has not been submitted by the deadline. Please follow up.`,
    relatedEntity: { type: 'DailyReport', id: null },
    channels: { inApp: true, email: !!cfg.SMTP_HOST },
    reminderForDate: date,
    priority: 'High',
    metadata: { 
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      originalNotificationId: originalNotificationId,
      isEscalation: true 
    },
  });

  if (cfg.SMTP_HOST) {
    try {
      await sendDailyReportReminder({
        toEmail: manager.user.email,
        toName: manager.fullName,
        date: date,
        role: manager.user.role,
        isEscalation: true,
        employeeName: employee.fullName,
      });
      notification.channels.emailSent = true;
      notification.channels.emailSentAt = new Date();
      await notification.save();
    } catch (err) {
      console.error(`[DailyReport] Failed to send escalation email to ${manager.fullName}:`, err.message);
    }
  }
}

async function sendHREscalationNotification(employee, date, originalNotificationId) {
  const hrUsers = await User.find({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' })
    .select('email fullName')
    .lean();

  for (const hrUser of hrUsers) {
    if (!hrUser.email) continue;

    const existing = await Notification.findOne({
      user: hrUser._id,
      type: 'Daily Report Escalation',
      reminderForDate: date,
      'metadata.employeeId': employee.employeeId,
    });

    if (existing) continue;

    const notification = await Notification.create({
      user: hrUser._id,
      type: 'Daily Report Escalation',
      title: `Daily Report Missing — ${employee.fullName} (${employee.employeeId})`,
      message: `The daily report for ${employee.fullName} (${employee.employeeId}) for ${date.toISOString().split('T')[0]} has not been submitted by the deadline.`,
      relatedEntity: { type: 'DailyReport', id: null },
      channels: { inApp: true, email: !!cfg.SMTP_HOST },
      reminderForDate: date,
      priority: 'Normal',
      metadata: { 
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        originalNotificationId: originalNotificationId,
        isEscalation: true 
      },
    });

    if (cfg.SMTP_HOST) {
      try {
        await sendDailyReportReminder({
          toEmail: hrUser.email,
          toName: hrUser.fullName,
          date: date,
          role: hrUser.role,
          isEscalation: true,
          employeeName: employee.fullName,
        });
        notification.channels.emailSent = true;
        notification.channels.emailSentAt = new Date();
        await notification.save();
      } catch (err) {
        console.error(`[DailyReport] Failed to send HR escalation email to ${hrUser.fullName}:`, err.message);
      }
    }
  }
}