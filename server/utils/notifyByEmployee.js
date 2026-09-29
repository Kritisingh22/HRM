/* notifyByEmployee — creates in-app Notification records for an employee's
 * assigned HR and/or manager only. This is the single place that decides "who
 * gets told about this employee's activity", so login/logout/check-in events
 * never broadcast to every HR or every manager (requirement #18 — notification
 * recipients are backend-determined and role/relationship-scoped, not a blast). */
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * @param {import('mongoose').Document} employee - the Employee doc the event is about
 * @param {object} payload - { type, title, message, priority, relatedEntity, metadata }
 * @param {object} [opts] - { toHR = true, toManager = true }
 */
async function notifyByEmployee(employee, payload, opts = {}) {
  if (!employee) return;
  const { toHR = true, toManager = true } = opts;
  const recipients = []; // User _ids

  try {
    if (toHR && employee.assignedHrId) {
      const hr = await Employee.findOne({ employeeId: employee.assignedHrId }).select('user');
      if (hr && hr.user) recipients.push(hr.user);
    }
    if (toManager && employee.manager) {
      const mgrEmp = await Employee.findOne({ employeeId: employee.manager }).select('user');
      if (mgrEmp && mgrEmp.user) recipients.push(mgrEmp.user);
    }

    const uniqueIds = [...new Set(recipients.map(String))];
    if (!uniqueIds.length) return;

    await Notification.insertMany(
      uniqueIds.map((userId) => ({
        user: userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        relatedEntity: payload.relatedEntity,
        priority: payload.priority || 'Normal',
        channels: { inApp: true, email: false },
        metadata: payload.metadata,
      }))
    );
  } catch (err) {
    // Notifications are best-effort — never fail the login/logout/etc. flow because of them.
    console.error('[notifyByEmployee] failed:', err.message);
  }
}

module.exports = { notifyByEmployee };
