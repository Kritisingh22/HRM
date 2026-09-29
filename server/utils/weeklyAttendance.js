/* Derives one WeeklyAttendanceSummary row per employee from real records only:
 * Attendance (explicit daily status), LoginSession (login/logout → working
 * seconds per day), and Leave (approved leave). No value here is invented —
 * a day with none of the three sources is counted as "missing" (no data),
 * never as a fabricated "Absent". */
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const LoginSession = require('../models/LoginSession');
const Leave = require('../models/Leave');
const WeeklyAttendanceSummary = require('../models/WeeklyAttendanceSummary');

// Simple, configurable default policy — there is no company policy engine in
// this codebase yet, so these are reasonable defaults rather than a claim of
// exhaustively modeling real HR policy. Override via env if needed.
const LATE_AFTER = process.env.ATTENDANCE_LATE_AFTER || '10:00'; // 'HH:MM', 24h
const OVERTIME_AFTER_HOURS = Number(process.env.ATTENDANCE_OVERTIME_AFTER_HOURS || 9);

// Local-time YYYY-MM-DD. Must match mondayOf(), which uses local time — using
// toISOString() (UTC) here shifted week boundaries by a day on servers whose
// timezone isn't UTC (e.g. IST), so a Monday-00:00 week start became "Sunday".
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// Monday 00:00 of the week containing `d` (local server time).
function mondayOf(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

/**
 * Computes and upserts the WeeklyAttendanceSummary for one employee for the
 * week containing `referenceDate` (defaults to "last week" relative to now).
 * Upsert on (employee, weekStart) — safe to call repeatedly (requirement #21).
 */
async function computeWeeklySummaryForEmployee(employeeDoc, referenceDate) {
  const weekStart = mondayOf(referenceDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const startStr = toISODate(weekStart);
  const endStr = toISODate(weekEnd);

  const [attendanceRows, leaveRows, sessionRows] = await Promise.all([
    Attendance.find({ employee: employeeDoc._id, date: { $gte: startStr, $lte: endStr } }),
    Leave.find({
      employee: employeeDoc._id,
      status: 'Approved',
      from: { $lte: weekEnd },
      to: { $gte: weekStart },
    }),
    LoginSession.find({
      employeeId: employeeDoc.employeeId,
      loginAt: { $gte: weekStart, $lte: weekEnd },
    }),
  ]);

  const attendanceByDate = {};
  attendanceRows.forEach((a) => { attendanceByDate[a.date] = a; });

  const leaveDates = new Set();
  leaveRows.forEach((l) => {
    const from = l.from < weekStart ? weekStart : l.from;
    const to = l.to > weekEnd ? weekEnd : l.to;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      leaveDates.add(toISODate(d));
    }
  });

  // Bucket LoginSession working-seconds per calendar date (a session's duration
  // is attributed to the date it started on — sessions here are same-day shifts).
  const workingSecondsByDate = {};
  sessionRows.forEach((s) => {
    const dateKey = toISODate(s.loginAt);
    const seconds = s.status === 'Active' ? s.liveDurationSeconds() : (s.durationSeconds || 0);
    workingSecondsByDate[dateKey] = (workingSecondsByDate[dateKey] || 0) + seconds;
  });

  let daysPresent = 0, daysAbsent = 0, daysHalfDay = 0, daysLeave = 0,
    daysWeekend = 0, daysMissing = 0, lateCount = 0, overtimeCount = 0,
    totalWorkingSeconds = 0;

  for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const rec = attendanceByDate[iso];
    const daySeconds = workingSecondsByDate[iso] || 0;
    totalWorkingSeconds += daySeconds;

    if (isWeekend) {
      daysWeekend++;
      continue;
    }
    if (rec) {
      if (rec.status === 'present' || rec.status === 'wfh') daysPresent++;
      else if (rec.status === 'absent') daysAbsent++;
      else if (rec.status === 'halfday') daysHalfDay++;
      else if (rec.status === 'leave') daysLeave++;
      if (rec.checkIn && rec.checkIn > LATE_AFTER) lateCount++;
    } else if (leaveDates.has(iso)) {
      daysLeave++;
    } else if (daySeconds > 0) {
      // No explicit Attendance row, but a real login session exists that day →
      // derive Present from login activity rather than counting it "missing".
      daysPresent++;
    } else if (d <= new Date()) {
      daysMissing++; // no attendance record, no session, no leave — genuinely no data
    }
    if (daySeconds > OVERTIME_AFTER_HOURS * 3600) overtimeCount++;
  }

  return WeeklyAttendanceSummary.findOneAndUpdate(
    { employee: employeeDoc._id, weekStart },
    {
      $set: {
        employeeId: employeeDoc.employeeId,
        weekEnd,
        daysPresent, daysAbsent, daysHalfDay, daysLeave, daysWeekend, daysMissing,
        lateCount, overtimeCount, totalWorkingSeconds,
        generatedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Runs the derivation for every Active employee, for the week containing referenceDate. */
async function computeWeeklySummariesForAllEmployees(referenceDate = new Date()) {
  const employees = await Employee.find({ status: 'Active' });
  const results = [];
  for (const emp of employees) {
    try {
      results.push(await computeWeeklySummaryForEmployee(emp, referenceDate));
    } catch (err) {
      console.error(`[weeklyAttendance] failed for ${emp.employeeId}:`, err.message);
    }
  }
  return results;
}

module.exports = {
  mondayOf,
  computeWeeklySummaryForEmployee,
  computeWeeklySummariesForAllEmployees,
};
