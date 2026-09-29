/* WeeklyAttendanceSummary — one row per employee per calendar week (Mon–Sun),
 * derived entirely from real records (Attendance, LoginSession, Leave). Never
 * hand-entered. The unique (employee, weekStart) index is what makes the
 * weekly job idempotent (requirement #21): re-running it for a week that
 * already has a summary updates that same row via upsert, it never creates a
 * duplicate, and it never touches the underlying Attendance/LoginSession/Leave
 * records those numbers were derived from. */
const mongoose = require('mongoose');

const weeklyAttendanceSummarySchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeId: { type: String, required: true, trim: true, index: true },

    weekStart: { type: Date, required: true }, // Monday 00:00 (server-local)
    weekEnd: { type: Date, required: true },   // Sunday 23:59:59

    daysPresent: { type: Number, default: 0 },
    daysAbsent: { type: Number, default: 0 },
    daysHalfDay: { type: Number, default: 0 },
    daysLeave: { type: Number, default: 0 },
    daysWeekend: { type: Number, default: 0 },
    daysMissing: { type: Number, default: 0 }, // weekday, no attendance/session/leave — "no data", not fabricated "Absent"

    lateCount: { type: Number, default: 0 },
    overtimeCount: { type: Number, default: 0 },

    totalWorkingSeconds: { type: Number, default: 0 }, // summed from LoginSession, server-computed durations only

    generatedAt: { type: Date, default: Date.now },
    source: { type: String, default: 'weekly-job' }, // 'weekly-job' | 'manual-recompute'
  },
  { timestamps: true }
);

// The idempotency guarantee requirement #21 asks for.
weeklyAttendanceSummarySchema.index({ employee: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyAttendanceSummary', weeklyAttendanceSummarySchema);
