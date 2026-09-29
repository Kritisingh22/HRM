/* Scheduler — runs automatic background jobs (daily report reminders, overdue marking, etc.).
 * Uses node-cron for scheduling. Started from server.js on application boot. */
const cron = require('node-cron');
const cfg = require('./config/env');
const DailyReport = require('./models/DailyReport');
const Employee = require('./models/Employee');
const User = require('./models/User');
const Notification = require('./models/Notification');
const AccessRequest = require('./models/AccessRequest');
const { computeWeeklySummariesForAllEmployees } = require('./utils/weeklyAttendance');
const { sendDailyReportReminder } = require('./services/emailService');
const { logAudit } = require('./utils/audit');

let reminderJob = null;
let overdueJob = null;
let accessExpiryJob = null;
let weeklyAttendanceJob = null;

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

/**
 * Start all scheduled jobs.
 * Call this once on server startup.
 */
function startScheduler() {
  if (cfg.NODE_ENV === 'test') {
    console.log('[Scheduler] Skipping cron jobs in test environment');
    return;
  }

  // Daily report reminder job - runs every hour at minute 0 (e.g., 9:00, 10:00, etc.)
  // Checks if it's past the deadline and sends reminders for missing reports
  const reminderCron = `${cfg.DAILY_REPORT_DEADLINE_MINUTE} * * * *`; // Every hour at configured minute
  reminderJob = cron.schedule(reminderCron, async () => {
    console.log('[Scheduler] Running daily report reminder check...');
    await checkAndSendReminders();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
  console.log(`[Scheduler] Daily report reminder job scheduled: ${reminderCron} (Asia/Kolkata)`);

  // Mark overdue job - runs daily at midnight
  overdueJob = cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Running daily report overdue check...');
    await markOverdueReports();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
  console.log('[Scheduler] Daily report overdue job scheduled: 0 0 * * * (Asia/Kolkata)');

  // Access-grant expiry job — runs every 15 minutes. Requirement #11: "After
  // expiration, permissions automatically end" — this is what makes that true,
  // rather than expiry being merely a date teamScope.js happens to check.
  accessExpiryJob = cron.schedule('*/15 * * * *', async () => {
    await expireAccessGrants();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
  console.log('[Scheduler] Access-grant expiry job scheduled: */15 * * * * (Asia/Kolkata)');

  // Weekly attendance summary — requirement #20/#21. Runs Monday 00:30, deriving
  // last week's summary from real Attendance/LoginSession/Leave data. Upserts on
  // (employee, weekStart), so re-running it is always safe (never duplicates,
  // never touches the underlying records it was derived from).
  weeklyAttendanceJob = cron.schedule('30 0 * * 1', async () => {
    try {
      const lastWeekRef = new Date();
      lastWeekRef.setDate(lastWeekRef.getDate() - 1); // land in the week that just ended (Sunday)
      const results = await computeWeeklySummariesForAllEmployees(lastWeekRef);
      console.log(`[Scheduler] Weekly attendance summary generated for ${results.length} employee(s).`);
    } catch (err) {
      console.error('[Scheduler] Weekly attendance summary job failed:', err.message);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
  console.log('[Scheduler] Weekly attendance summary job scheduled: 30 0 * * 1 (Asia/Kolkata)');

  console.log('[Scheduler] All jobs started');
}

/**
 * Stop all scheduled jobs.
 * Call this on server shutdown.
 */
function stopScheduler() {
  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;
  }
  if (overdueJob) {
    overdueJob.stop();
    overdueJob = null;
  }
  if (accessExpiryJob) {
    accessExpiryJob.stop();
    accessExpiryJob = null;
  }
  if (weeklyAttendanceJob) {
    weeklyAttendanceJob.stop();
    weeklyAttendanceJob = null;
  }
  console.log('[Scheduler] All jobs stopped');
}

/**
 * Marks any Approved, non-transfer AccessRequest whose expiresAt has passed as
 * Expired. teamScope.js already ignores expired grants (it filters on
 * expiresAt itself), so this job's real job is making that state visible/auditable
 * rather than leaving stale "Approved" rows that quietly stopped granting anything.
 */
async function expireAccessGrants() {
  try {
    const result = await AccessRequest.updateMany(
      { status: 'Approved', isTransfer: false, expiresAt: { $ne: null, $lt: new Date() } },
      { $set: { status: 'Expired' } }
    );
    if (result.modifiedCount) {
      console.log(`[Scheduler] Expired ${result.modifiedCount} access grant(s).`);
    }
  } catch (err) {
    console.error('[Scheduler] Access-grant expiry check failed:', err.message);
  }
}

/**
 * Check for missing daily reports and send reminders.
 * Runs on a schedule (hourly after deadline).
 */
async function checkAndSendReminders() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Only check if we're at or past the deadline hour
    if (currentHour < cfg.DAILY_REPORT_DEADLINE_HOUR) {
      console.log('[Scheduler] Before deadline, skipping reminder check');
      return;
    }
    if (currentHour === cfg.DAILY_REPORT_DEADLINE_HOUR && currentMinute < cfg.DAILY_REPORT_DEADLINE_MINUTE) {
      console.log('[Scheduler] Before deadline minute, skipping reminder check');
      return;
    }

    // Check for yesterday's missing reports (reports due yesterday)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const date = startOfDay(yesterday);

    // Get all active employees who should submit reports
    const employees = await Employee.find({ status: 'Active' })
      .select('employeeId fullName email user manager')
      .populate('user', 'email fullName role')
      .populate('manager', 'employeeId fullName user')
      .lean();

    if (employees.length === 0) {
      console.log('[Scheduler] No active employees found');
      return;
    }

    // Check which employees already submitted for yesterday
    const submittedReports = await DailyReport.find({
      date: { $gte: startOfDay(yesterday), $lte: endOfDay(yesterday) },
      status: { $in: ['Submitted', 'Reviewed'] },
    }).select('employee').lean();

    const submittedEmployeeIds = new Set(submittedReports.map(r => String(r.employee)));

    // Find employees who haven't submitted
    const missingEmployees = employees.filter(emp => !submittedEmployeeIds.has(String(emp._id)));

    console.log(`[Scheduler] ${missingEmployees.length} missing reports for ${date.toISOString().split('T')[0]}`);

    if (missingEmployees.length === 0) return;

    // For each missing employee, create notification and send email
    for (const emp of missingEmployees) {
      if (!emp.user || !emp.user.email) {
        console.warn(`[Scheduler] Employee ${emp.employeeId} has no linked user/email, skipping`);
        continue;
      }

      // Check if reminder already sent for this employee/date (deduplication)
      const frequencyMs = cfg.DAILY_REPORT_REMINDER_FREQUENCY_HOURS * 60 * 60 * 1000;
      const since = new Date(Date.now() - frequencyMs);

      const existingNotification = await Notification.findOne({
        user: emp.user._id,
        type: 'Daily Report Reminder',
        reminderForDate: date,
        createdAt: { $gte: since },
      });

      if (existingNotification) {
        console.log(`[Scheduler] Reminder already sent to ${emp.fullName} for ${date.toISOString().split('T')[0]} (within frequency window)`);
        continue;
      }

      // Create in-app notification
      const notification = await Notification.create({
        user: emp.user._id,
        type: 'Daily Report Reminder',
        title: `Daily Report Reminder — ${date.toISOString().split('T')[0]}`,
        message: `Your daily task report for ${date.toISOString().split('T')[0]} has not been submitted. The submission deadline was ${cfg.DAILY_REPORT_DEADLINE_HOUR.toString().padStart(2, '0')}:${cfg.DAILY_REPORT_DEADLINE_MINUTE.toString().padStart(2, '0')}. Please submit it as soon as possible.`,
        relatedEntity: { type: 'DailyReport', id: null },
        channels: { inApp: true, email: !!cfg.SMTP_HOST },
        reminderForDate: date,
        priority: 'High',
        metadata: { deadlineHour: cfg.DAILY_REPORT_DEADLINE_HOUR, deadlineMinute: cfg.DAILY_REPORT_DEADLINE_MINUTE },
      });

      // Send email if configured
      if (cfg.SMTP_HOST && emp.user.email) {
        try {
          await sendDailyReportReminder({
            toEmail: emp.user.email,
            toName: emp.fullName,
            date: date,
            role: emp.user.role,
          });
          notification.channels.emailSent = true;
          notification.channels.emailSentAt = new Date();
          await notification.save();
        } catch (err) {
          console.error(`[Scheduler] Failed to send email to ${emp.fullName}:`, err.message);
        }
      }

      // Escalation to manager
      if (cfg.DAILY_REPORT_ESCALATE_TO_MANAGER && emp.manager && emp.manager.user) {
        await sendEscalationNotification(emp, emp.manager, date, notification._id);
      }

      // Escalation to HR (optional, based on config)
      if (cfg.DAILY_REPORT_ESCALATE_TO_HR) {
        await sendHREscalationNotification(emp, date, notification._id);
      }

      logAudit({ user: emp.user }, {
        action: 'daily_report.reminder_sent',
        targetType: 'DailyReport',
        targetId: notification._id,
        description: `Daily report reminder sent to ${emp.employeeId} for ${date.toISOString().split('T')[0]}`,
      });
    }

    console.log('[Scheduler] Reminder check completed');
  } catch (err) {
    console.error('[Scheduler] Error in checkAndSendReminders:', err);
  }
}

/**
 * Send escalation notification to manager.
 */
async function sendEscalationNotification(employee, manager, date, originalNotificationId) {
  if (!manager.user || !manager.user.email) return;

  const existing = await Notification.findOne({
    user: manager.user._id,
    type: 'Daily Report Escalation',
    reminderForDate: date,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
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
      console.error(`[Scheduler] Failed to send escalation email to ${manager.fullName}:`, err.message);
    }
  }
}

/**
 * Send escalation notification to HR users.
 */
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
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
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
        console.error(`[Scheduler] Failed to send HR escalation email to ${hrUser.fullName}:`, err.message);
      }
    }
  }
}

/**
 * Mark old Draft reports as Overdue.
 * Runs daily at midnight.
 */
async function markOverdueReports() {
  try {
    const today = startOfDay(new Date());
    const result = await DailyReport.updateMany(
      { status: 'Draft', date: { $lt: today } },
      { $set: { status: 'Overdue' } }
    );

    if (result.modifiedCount > 0) {
      console.log(`[Scheduler] Marked ${result.modifiedCount} reports as Overdue`);
      logAudit({ user: null }, {
        action: 'daily_report.mark_overdue',
        targetType: 'DailyReport',
        targetId: null,
        description: `Marked ${result.modifiedCount} reports as Overdue (automated)`,
      });
    }
  } catch (err) {
    console.error('[Scheduler] Error in markOverdueReports:', err);
  }
}

/**
 * Manually trigger reminder check (for testing or manual runs).
 * Returns { remindersSent: number, date: string }
 */
async function triggerReminderCheck(targetDate) {
  const date = targetDate ? startOfDay(new Date(targetDate)) : startOfDay(new Date(Date.now() - 86400000)); // default to yesterday
  
  const employees = await Employee.find({ status: 'Active' })
    .select('employeeId fullName email user manager')
    .populate('user', 'email fullName role')
    .populate('manager', 'employeeId fullName user')
    .lean();

  const submittedReports = await DailyReport.find({
    date: { $gte: startOfDay(date), $lte: endOfDay(date) },
    status: { $in: ['Submitted', 'Reviewed'] },
  }).select('employee').lean();

  const submittedEmployeeIds = new Set(submittedReports.map(r => String(r.employee)));
  const missingEmployees = employees.filter(emp => !submittedEmployeeIds.has(String(emp._id)));

  let sent = 0;
  for (const emp of missingEmployees) {
    if (!emp.user || !emp.user.email) continue;

    // Create notification without frequency check for manual trigger
    const notification = await Notification.create({
      user: emp.user._id,
      type: 'Daily Report Reminder',
      title: `Daily Report Reminder — ${date.toISOString().split('T')[0]}`,
      message: `Your daily task report for ${date.toISOString().split('T')[0]} has not been submitted. Please submit it as soon as possible.`,
      relatedEntity: { type: 'DailyReport', id: null },
      channels: { inApp: true, email: !!cfg.SMTP_HOST },
      reminderForDate: date,
      priority: 'High',
      metadata: { manualTrigger: true },
    });

    if (cfg.SMTP_HOST) {
      try {
        await sendDailyReportReminder({
          toEmail: emp.user.email,
          toName: emp.fullName,
          date: date,
          role: emp.user.role,
        });
        notification.channels.emailSent = true;
        notification.channels.emailSentAt = new Date();
        await notification.save();
      } catch (err) {
        console.error(`[Scheduler] Failed to send email to ${emp.fullName}:`, err.message);
      }
    }

    sent++;
  }

  return { remindersSent: sent, date: date.toISOString().split('T')[0] };
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndSendReminders,
  markOverdueReports,
  triggerReminderCheck,
  expireAccessGrants,
  computeWeeklySummariesForAllEmployees,
};