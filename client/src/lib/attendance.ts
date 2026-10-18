/* ============================================================
   Attendance — derived, not stored.

   The portal keeps only *explicit* attendance entries
   (`attendanceOverrides`) and derives everything else from a
   deterministic hash of (employeeId, date). That keeps storage
   tiny, keeps demo data identical on every reload, and means a
   real backend can simply start filling the override map.

   Rules mirrored from the original preview:
   • weekends & company holidays produce no record
   • future days (and today, still in progress) produce no record
   • approved leave wins over everything else
   • explicit overrides always win
   • ~4% absent, ~6% half day, ~12% WFH of the remainder
   • check-in 09:00–09:55, check-out 17:50–19:20, with
     late / early-out / overtime notes
   ============================================================ */
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveStatus,
} from '@/types';
import { hash01, isWeekend, parseISO, pad, todayISO, toISO } from '@/lib/date';

export interface AttendanceContext {
  holidays: Holiday[];
  leaveRequests: LeaveRequest[];
  overrides: Record<string, AttendanceRecord>;
}

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; color: string }> = {
  present: { label: 'Present', color: '#22C55E' },
  absent: { label: 'Absent', color: '#EF4444' },
  halfday: { label: 'Half Day', color: '#F97316' },
  wfh: { label: 'Work From Home', color: '#8B5CF6' },
  leave: { label: 'Leave', color: '#F59E0B' },
};

/** Status colours used by calendar chips/dots, matching the ported design tones. */
export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
  Pending: '#F59E0B',
  Approved: '#22C55E',
  Rejected: '#EF4444',
  Cancelled: '#94A3B8',
};

export const LEAVE_TYPE_COLORS: Record<string, string> = {
  'Casual Leave': '#7FD4C1',
  'Sick Leave': '#F59E0B',
  'Paid Leave': '#3B82F6',
  'Unpaid Leave': '#94A3B8',
  'Earned Leave': '#3B82F6',
  'Comp-Off': '#8B5CF6',
  'Bereavement Leave': '#94A3B8',
  'Maternity/Paternity Leave': '#8B5CF6',
  'Work From Home': '#8B5CF6',
};

export const LEAVE_TYPES = [
  'Casual Leave',
  'Sick Leave',
  'Paid Leave',
  'Unpaid Leave',
  'Earned Leave',
  'Comp-Off',
  'Bereavement Leave',
  'Maternity/Paternity Leave',
  'Work From Home',
];

export function overrideKey(employeeId: string, iso: string): string {
  return `${employeeId}|${iso}`;
}

/**
 * API sessions display only recorded attendance. The deterministic
 * demo fill below is disabled there, so a real workspace never shows
 * an invented day — unrecorded days stay blank.
 */
let realDataOnly = false;

export function setAttendanceSource(apiSession: boolean): void {
  realDataOnly = apiSession;
}

export function holidayOn(holidays: Holiday[], iso: string): Holiday | null {
  return holidays.find((h) => h.date === iso) ?? null;
}

/** A non-cancelled leave request covering the given date (ISO compare). */
export function requestOn(leaveRequests: LeaveRequest[], employeeId: string, iso: string): LeaveRequest | null {
  return (
    leaveRequests.find(
      (r) => r.employeeId === employeeId && r.status !== 'Cancelled' && iso >= r.from && iso <= r.to,
    ) ?? null
  );
}

function fmtTime(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${pad(h)}:${pad(m)} ${ap}`;
}

/** `'09:05 AM'` (or 24-hour) → minutes since midnight; `null` when unparsable. */
export function parseClockMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const suffix = m[3]?.toUpperCase();
  if (suffix === 'PM' && h < 12) h += 12;
  if (suffix === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** `'09:05 AM'`–`'06:35 PM'` → `'9h 30m'`; `null` when either side is unparsable. */
export function durationText(from: string, to: string): string | null {
  const a = parseClockMinutes(from);
  const b = parseClockMinutes(to);
  if (a === null || b === null || b <= a) return null;
  const mins = b - a;
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
}

function deterministic(employeeId: string, iso: string): AttendanceRecord {
  const r = hash01(`${employeeId}|${iso}`);
  if (r < 0.04) return { status: 'absent' };
  if (r < 0.1) {
    return { status: 'halfday', checkIn: '09:05 AM', checkOut: '01:35 PM', workingHours: '4h 30m' };
  }
  const base = hash01(`${employeeId}|${iso}|i`);
  const inMin = 540 + Math.floor(hash01(`${employeeId}|${iso}|in`) * 55); // 09:00–09:55
  const outMin = 1070 + Math.floor(hash01(`${employeeId}|${iso}|out`) * 90); // 17:50–19:20
  const total = outMin - inMin;
  const rec: AttendanceRecord = {
    status: r < 0.22 ? 'wfh' : 'present',
    checkIn: fmtTime(inMin),
    checkOut: fmtTime(outMin),
    workingHours: `${Math.floor(total / 60)}h ${pad(total % 60)}m`,
  };
  void base;
  if (inMin > 570) rec.lateBy = `${inMin - 570} min`; // after 09:30
  if (outMin < 1080) rec.earlyOut = `${1080 - outMin} min`; // before 06:00 PM
  if (outMin > 1125) rec.overtime = `${outMin - 1125} min`; // after 06:45 PM
  return rec;
}

/**
 * The attendance record for one employee on one day.
 * Returns `null` for weekends, holidays, today and future days.
 */
export function attendanceOn(
  employeeId: string,
  iso: string,
  ctx: AttendanceContext,
): AttendanceRecord | null {
  const explicit = ctx.overrides[overrideKey(employeeId, iso)];
  if (explicit) return explicit;

  const d = parseISO(iso);
  if (isWeekend(d)) return null;
  if (holidayOn(ctx.holidays, iso)) return null;
  if (iso >= todayISO()) return null;

  const req = requestOn(ctx.leaveRequests, employeeId, iso);
  if (req && req.status === 'Approved') {
    return {
      status: req.type === 'Work From Home' ? 'wfh' : 'leave',
      leaveType: req.type,
      approvalStatus: 'Approved',
    };
  }
  if (realDataOnly) return null; // no server record for this day
  return deterministic(employeeId, iso);
}

/** Count working days between two ISO dates, skipping weekends & holidays. */
export function countWorkingDays(from: string, to: string, holidays: Holiday[]): number {
  let n = 0;
  let guard = 0;
  const end = parseISO(to);
  for (const d = parseISO(from); d <= end && guard < 400; d.setDate(d.getDate() + 1), guard++) {
    if (!isWeekend(d) && !holidayOn(holidays, toISO(d))) n++;
  }
  return n;
}

export interface MonthSummary {
  present: number;
  absent: number;
  half: number;
  wfh: number;
  leave: number;
  working: number;
  elapsed: number;
  /** attendance rate; excludes authorised leave from the denominator */
  pct: number | null;
}

/** Monthly attendance summary for one employee (mirrors the original block). */
export function monthSummary(
  employeeId: string,
  year: number,
  monthIndex: number,
  ctx: AttendanceContext,
): MonthSummary {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let present = 0;
  let absent = 0;
  let half = 0;
  let wfh = 0;
  let leave = 0;
  let working = 0;
  let elapsed = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
    const d = parseISO(iso);
    if (isWeekend(d) || holidayOn(ctx.holidays, iso)) continue;
    working++;
    if (iso >= todayISO()) continue; // today is still in progress
    elapsed++;
    const att = attendanceOn(employeeId, iso, ctx);
    if (att) {
      if (att.status === 'present') present++;
      else if (att.status === 'absent') absent++;
      else if (att.status === 'halfday') half++;
      else if (att.status === 'wfh') wfh++;
      else if (att.status === 'leave') leave++;
    }
  }

  const payableDays = elapsed - leave;
  const pct = payableDays > 0 ? Math.round(((present + wfh + half * 0.5) / payableDays) * 100) : null;
  return { present, absent, half, wfh, leave, working, elapsed, pct };
}

/** Company-wide present / WFH counts for a set of dates (dashboard chart). */
export function seriesForDates(
  dates: Date[],
  employees: Employee[],
  ctx: AttendanceContext,
): { present: number[]; wfh: number[] } {
  const present: number[] = [];
  const wfh: number[] = [];
  for (const d of dates) {
    const iso = toISO(d);
    let p = 0;
    let w = 0;
    for (const e of employees) {
      const att = attendanceOn(e.id, iso, ctx);
      if (!att) continue;
      if (att.status === 'present') p++;
      else if (att.status === 'halfday') p += 0.5;
      else if (att.status === 'wfh') w++;
    }
    present.push(Math.round(p));
    wfh.push(w);
  }
  return { present, wfh };
}

/** Attendance rate for one day across the roster (dashboard footer). */
export function dayAttendancePct(iso: string, employees: Employee[], ctx: AttendanceContext): number | null {
  let total = 0;
  let present = 0;
  for (const e of employees) {
    const d = parseISO(iso);
    if (isWeekend(d) || holidayOn(ctx.holidays, iso)) continue;
    total++;
    const att = attendanceOn(e.id, iso, ctx);
    if (!att) continue;
    if (att.status === 'present') present++;
    else if (att.status === 'halfday') present += 0.5;
    else if (att.status === 'wfh') present++;
  }
  if (!total) return null;
  return Math.round((present / total) * 100);
}
