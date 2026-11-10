/* ============================================================
   realMap — projections from the HRM API's documents onto the
   store's view types.

   Pure functions, no fetching. Every field is derived from real
   server data; anything the server does not store stays empty
   (never invented). Reverse helpers do the same job for writes.
   ============================================================ */
import type {
  Announcement,
  AppNotification,
  AttendanceRecord,
  AuditEntry,
  CalendarEvent,
  Candidate,
  Department,
  Designation,
  DocumentRecord,
  Employee,
  ExitRecord,
  FunnelStage,
  Job,
  LeaveRequest,
  LocationRecord,
  PayrollRow,
  PayrollRun,
  Project,
  Promotion,
  Review,
  Target,
  Task,
  TeamTask,
  Ticket,
  Training,
  Transfer,
} from '@/types';
import { HOLIDAYS } from '@/data/seed';
import { durationText, parseClockMinutes } from '@/lib/attendance';
import { pad } from '@/lib/date';
import { periodPayDate } from '@/lib/payroll';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

/* ---------------- helpers ---------------- */

/** Any date-ish value → `YYYY-MM-DD` (UTC day, matching how the API stores dates). */
export function dateOnly(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Any date-ish value → local `HH:MM` (UTC-compensated for display). */
function clockOf(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `'09:05'` → `'09:05 AM'`; already-suffixed values pass through. */
function to12h(text: string): string {
  const mins = parseClockMinutes(text);
  if (mins === null) return text;
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${pad(h)}:${pad(m)} ${ap}`;
}

function relativeTime(v: unknown): string {
  if (!v) return '';
  const then = new Date(String(v)).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateOnly(v);
}

const has = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

/* ---------------- employees & org ---------------- */

export function mapEmployee(e: Raw): Employee {
  const status: Employee['status'] =
    e.status === 'Probation'
      ? 'Probation'
      : e.status === 'On Leave'
        ? 'On Leave'
        : e.status === 'Exited'
          ? 'Resigned'
          : e.status === 'Resigned'
            ? 'Resigned'
            : e.status === 'Terminated'
              ? 'Terminated'
              : 'Active';
  return {
    id: e.employeeId || String(e._id || ''),
    name: e.fullName || '',
    email: e.email || '',
    phone: e.phone || '',
    gender: e.gender === 'Female' ? 'Female' : e.gender === 'Male' ? 'Male' : 'Other',
    dob: '',
    dept: e.department || '',
    departmentId: e.departmentId || undefined,
    designation: e.designation || '',
    designationId: e.designationId || undefined,
    manager: e.manager || null,
    location: e.location || '',
    employmentType: ['Full-time', 'Part-time', 'Contract', 'Intern'].includes(e.employmentType)
      ? e.employmentType
      : 'Full-time',
    joining: dateOnly(e.joiningDate),
    status,
    probation: e.status === 'Probation',
    experience: '',
    salary: Number(e.salary || 0),
    grade: e.grade || '',
    bloodGroup: e.bloodGroup || undefined,
    emergency: e.emergencyContact || undefined,
    address: e.address || undefined,
  };
}

/** Departments the server does not model — derived from the real roster. */
export function deriveDepartments(employees: Employee[]): Department[] {
  const names = Array.from(new Set(employees.map((e) => e.dept).filter(Boolean))).sort();
  return names.map((name, i) => ({
    id: `DEP-${i + 1}`,
    name,
    head: null,
    budget: '',
    active: true,
  }));
}

export function deriveDesignations(employees: Employee[], departments: Department[]): Designation[] {
  const deptId = new Map(departments.map((d) => [d.name, d.id]));
  const seen = new Map<string, Designation>();
  for (const e of employees) {
    if (!e.dept || !e.designation) continue;
    const key = `${e.dept}|${e.designation}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      id: `DSG-${seen.size + 1}`,
      title: e.designation,
      deptId: deptId.get(e.dept) || '',
      min: '',
      max: '',
    });
  }
  return Array.from(seen.values());
}

/** Map a raw department document from the server API. */
export function mapDepartment(d: Raw): Department {
  return {
    id: String(d._id || d.id || d.departmentId || ''),
    name: d.name || '',
    head: d.headUserId || d.head || null,
    budget: d.budget || '',
    active: d.isActive !== false,
  };
}

/** Map a raw designation document from the server API. */
export function mapDesignation(d: Raw): Designation {
  return {
    id: String(d._id || d.id || ''),
    title: d.name || d.title || '',
    deptId: String(d.departmentId || d.department || ''),
    min: d.min || '',
    max: d.max || '',
  };
}

/* ---------------- leave ---------------- */

export function mapLeave(l: Raw): LeaveRequest {
  return {
    id: String(l._id),
    employeeId: l.employee?.employeeId || '',
    type: l.type || '',
    from: dateOnly(l.from),
    to: dateOnly(l.to),
    days: Number(l.days || 0),
    halfDay: !!l.halfDay,
    reason: l.reason || '',
    appliedOn: dateOnly(l.appliedOn || l.createdAt),
    status: l.status || 'Pending',
    managerNote: l.managerNote || '',
    approvalAuthority: l.approvalAuthority || 'Manager',
    decidedAt: l.status && l.status !== 'Pending' ? l.updatedAt || l.decidedAt || null : null,
  };
}

/** The four types the server's Leave model accepts. */
export const API_LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'];

export function leaveTypeToApi(type: string): string {
  if (API_LEAVE_TYPES.includes(type)) return type;
  if (type === 'Paid Leave') return 'Earned Leave';
  if (type === 'Comp-Off' || type === 'Bereavement Leave' || type === 'Maternity/Paternity Leave') {
    return 'Unpaid Leave';
  }
  if (type === 'Work From Home') return 'Casual Leave'; // server has no WFH leave type
  return 'Casual Leave';
}

/* ---------------- attendance ---------------- */

export function mapAttendanceRecord(raw: Raw): { key: string; record: AttendanceRecord } | null {
  const empId = raw.employee?.employeeId;
  if (!empId || !raw.date) return null;
  const record: AttendanceRecord = { status: raw.status || 'present' };
  if (has(raw.checkIn)) record.checkIn = to12h(String(raw.checkIn));
  if (has(raw.checkOut)) record.checkOut = to12h(String(raw.checkOut));
  if (record.checkIn && record.checkOut) {
    record.workingHours = durationText(record.checkIn, record.checkOut) || undefined;
  }
  const inMin = record.checkIn ? parseClockMinutes(record.checkIn) : null;
  const outMin = record.checkOut ? parseClockMinutes(record.checkOut) : null;
  if (inMin !== null && inMin > 570) record.lateBy = `${inMin - 570} min`;
  if (outMin !== null && outMin < 1080) record.earlyOut = `${1080 - outMin} min`;
  if (outMin !== null && outMin > 1125) record.overtime = `${outMin - 1125} min`;
  if (raw.status === 'leave' && raw.note) record.leaveType = String(raw.note);
  return { key: `${empId}|${raw.date}`, record };
}

/* ---------------- payroll ---------------- */

export function mapPayrollRow(raw: Raw): PayrollRow {
  const d: Raw = raw.deductions || {};
  const pf = Number(d.pf || 0);
  const tds = Number(d.tds || 0);
  const esi = Number(d.esi || 0);
  const other = Number(d.other || 0);
  const ded = pf + tds + esi + other;
  return {
    empId: raw.employee?.employeeId || '',
    basic: 0,
    hra: 0,
    conv: 0,
    special: 0,
    bonus: 0,
    gross: Number(raw.gross || 0),
    pt: 0,
    otherDed: other,
    ded,
    net: Number(raw.net || 0),
    payStatus: raw.status === 'Processed' || raw.status === 'Paid' ? 'Paid' : 'Pending',
    txnRef: raw.utr || raw.transactionId || raw.reference || undefined,
    officialId: String(raw._id),
    officialStatus: raw.status || 'Draft',
    payDate: has(raw.payDate) ? dateOnly(raw.payDate) : undefined,
    pf,
    tds,
    esi,
  };
}

/** Group real payslips into the period "runs" the payroll console renders. */
export function mapPayrollRuns(slips: Raw[]): PayrollRun[] {
  const byPeriod = new Map<string, Raw[]>();
  for (const s of slips) {
    const period = s.period;
    if (!period) continue;
    const list = byPeriod.get(period);
    if (list) list.push(s);
    else byPeriod.set(period, [s]);
  }
  return Array.from(byPeriod.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([period, list]) => {
      const statuses = list.map((s) => String(s.status || 'Draft'));
      const status: PayrollRun['status'] = statuses.some((s) => s === 'Draft')
        ? 'Draft'
        : statuses.every((s) => s === 'Processed' || s === 'Paid')
          ? 'Processed'
          : 'Approved';
      const payDates = list.map((s) => s.payDate).filter(Boolean).map(dateOnly).sort();
      return {
        id: `RUN-${period}`,
        period,
        status,
        rows: list.map(mapPayrollRow),
        payDate: payDates[payDates.length - 1] || periodPayDate(period),
        source: 'api' as const,
      };
    });
}

/* ---------------- performance ---------------- */

const RATING_TEXT: Record<number, string> = {
  1: 'Needs Improvement',
  2: 'Below Expectations',
  3: 'Meets Expectations',
  4: 'Exceeds Expectations',
  5: 'Outstanding',
};

export function ratingToNumber(rating: string | number | undefined, score?: number): number {
  if (typeof rating === 'number' && rating >= 1 && rating <= 5) return Math.round(rating);
  const n = Number(score);
  if (score !== undefined && !Number.isNaN(n) && n >= 1 && n <= 5) return Math.round(n);
  const map: Array<[string, number]> = [
    ['outstanding', 5],
    ['exceed', 4],
    ['meet', 3],
    ['below', 2],
    ['needs', 1],
  ];
  const text = String(rating || '').toLowerCase();
  for (const [key, value] of map) if (text.includes(key)) return value;
  return 3;
}

export function mapReview(p: Raw): Review {
  const rating = Number(p.rating || 0);
  return {
    id: String(p._id),
    employeeId: p.employee?.employeeId || '',
    cycle: p.cycle || '',
    period: p.cycle || '',
    score: rating,
    rating: RATING_TEXT[rating] || '',
    manager: p.reviewedBy?.fullName || '',
    date: dateOnly(p.updatedAt || p.createdAt),
    comments: p.managerFeedback || '',
  };
}

/** KPI targets = the goals embedded in real performance reviews. */
export function mapTargets(performance: Raw[]): Target[] {
  const out: Target[] = [];
  for (const p of performance) {
    const empId = p.employee?.employeeId || '';
    (p.goals || []).forEach((g: Raw, i: number) => {
      const target = Number(String(g.target ?? '').replace(/[^\d.]/g, ''));
      const achieved = Number(String(g.achieved ?? '').replace(/[^\d.]/g, ''));
      out.push({
        id: `${p._id}:${i}`,
        employeeId: empId,
        dept: p.employee?.department || '',
        name: g.title || `Goal ${i + 1}`,
        kpi: g.title || '',
        target: Number.isFinite(target) ? target : 0,
        achieved: Number.isFinite(achieved) ? achieved : 0,
        unit: '',
        start: '',
        end: '',
        weightage: Number(g.weightage || 0),
        status: g.status || 'In Progress',
      });
    });
  }
  return out;
}

/* ---------------- projects & tasks ---------------- */

export function mapProject(p: Raw): Project {
  const status: Project['status'] =
    p.status === 'Active'
      ? 'Active'
      : p.status === 'On Hold'
        ? 'On Hold'
        : p.status === 'Completed'
          ? 'Completed'
          : 'Planning';
  return {
    id: String(p._id),
    name: p.name || '',
    client: '',
    dept: p.manager?.department || '',
    manager: p.manager?.employeeId || '',
    start: dateOnly(p.startDate),
    end: dateOnly(p.endDate),
    budget: '',
    priority: 'Medium',
    status,
    progress: Number(p.progress || 0),
    members: (p.members || []).map((m: Raw) => m?.employeeId || '').filter(Boolean),
    description: p.description || '',
  };
}

export function taskStatusFromApi(s: string): Task['status'] {
  if (s === 'In Progress') return 'In Progress';
  if (s === 'Done' || s === 'Completed') return 'Completed';
  return 'To Do';
}

export function taskStatusToApi(s: string): string {
  if (s === 'In Progress' || s === 'Review') return 'In Progress';
  if (s === 'Completed') return 'Done';
  return 'To Do';
}

export function mapTasks(p: Raw): Task[] {
  return (p.tasks || []).map((t: Raw, i: number) => ({
    id: String(t._id || `${p._id}:${i}`),
    title: t.title || '',
    projectId: String(p._id),
    assignee: t.assignee?.employeeId || '',
    assignedBy: '',
    priority: 'Medium',
    start: '',
    due: dateOnly(t.due),
    status: taskStatusFromApi(String(t.status || 'To Do')),
    progress: t.status === 'Done' || t.status === 'Completed' ? 100 : t.status === 'In Progress' ? 50 : 0,
    est: 0,
    actual: 0,
  }));
}

/* ---------------- recruitment ---------------- */

export function mapJob(h: Raw): Job {
  const status: Job['status'] =
    h.status === 'Open' ? 'Open' : h.status === 'On Hold' ? 'On Hold' : h.status === 'Closed' ? 'Closed' : 'Open';
  return {
    id: String(h._id),
    title: h.title || '',
    dept: h.department || '',
    designation: h.title || '',
    location: h.location || '',
    employmentType: 'Full-time',
    workMode: 'On-site',
    experience: '',
    qualification: '',
    skills: '',
    salMin: '',
    salMax: '',
    vacancies: Number(h.openings || 1),
    deadline: '',
    recruiter: h.createdBy?.fullName || '',
    description: h.description || '',
    status,
  };
}

export function stageFromApi(s: string): Candidate['stage'] {
  if (s === 'Screening') return 'Screening';
  if (s === 'Interview') return 'Interview';
  if (s === 'Offer') return 'Offer Sent';
  if (s === 'Selected') return 'Selected';
  if (s === 'Rejected') return 'Rejected';
  return 'Applied';
}

export function stageToApi(stage: string): string {
  if (stage === 'Screening' || stage === 'Shortlisted') return 'Screening';
  if (stage === 'Interview' || stage === 'Technical Round' || stage === 'HR Round') return 'Interview';
  if (stage === 'Offer Sent' || stage === 'Offer Accepted') return 'Offer';
  if (stage === 'Selected' || stage === 'Hired') return 'Selected';
  if (stage === 'Rejected') return 'Rejected';
  return 'Applied';
}

export function mapCandidates(hiring: Raw[]): Candidate[] {
  const out: Candidate[] = [];
  for (const h of hiring) {
    (h.candidates || []).forEach((c: Raw, i: number) => {
      out.push({
        id: `${h._id}:${i}`,
        name: c.name || '',
        email: c.email || '',
        phone: '',
        location: '',
        qualification: '',
        experience: '',
        skills: '',
        jobId: String(h._id),
        applied: '',
        recruiter: '',
        source: c.source || '',
        stage: stageFromApi(String(c.stage || 'Applied')),
        notes: '',
      });
    });
  }
  return out;
}

/* ---------------- documents, notices, helpdesk ---------------- */

export function mapDocument(d: Raw): DocumentRecord {
  return {
    id: String(d._id),
    name: d.title || d.originalName || 'Document',
    type: d.category || 'Other',
    owner: d.owner?.employeeId ?? null,
    uploaded: dateOnly(d.createdAt),
    // Server records carry a real verification workflow (PUT /:id/verify).
    status: d.verified ? 'Verified' : 'Pending',
    mimeType: typeof d.mimeType === 'string' && d.mimeType ? d.mimeType : undefined,
    size: typeof d.size === 'number' ? d.size : undefined,
    uploadStatus:
      d.uploadStatus === 'missing' || d.uploadStatus === 'deleted' ? d.uploadStatus : 'active',
  };
}

export function mapAnnouncement(n: Raw): Announcement {
  return {
    id: String(n._id),
    title: n.title || '',
    body: n.body || '',
    author: n.author?.fullName || 'HR',
    date: dateOnly(n.publishedAt || n.createdAt),
    pinned: !!n.pinned,
  };
}

export function mapTicket(t: Raw): Ticket {
  const status: Ticket['status'] =
    t.status === 'In Progress' ? 'In Progress' : t.status === 'Resolved' || t.status === 'Closed' ? 'Resolved' : 'Open';
  return {
    id: String(t._id),
    subject: t.subject || '',
    category: t.category || 'Other',
    message: t.description || '',
    by: t.raisedBy?.fullName || '',
    date: dateOnly(t.createdAt),
    status,
  };
}

/* ---------------- offboarding, transfers, training ---------------- */

export function mapExit(o: Raw): ExitRecord {
  const clearance = o.clearance || [];
  const clearanceDone = clearance.length > 0 && clearance.every((c: Raw) => c.done);
  return {
    id: String(o._id),
    employeeId: o.employee?.employeeId || '',
    resignationDate: dateOnly(o.createdAt),
    lastDay: dateOnly(o.lastWorkingDate),
    reason: o.reason || '',
    noticePeriod: '',
    assetReturn: 'Pending',
    clearance: clearanceDone ? 'Completed' : 'Pending',
    settlement: o.status === 'Completed' ? 'Processed' : 'Pending',
    status: o.status || 'Initiated',
  };
}

/** The per-exit done-checklist items, keyed the way the page stores them. */
export function exitChecklistsFrom(records: Raw[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const o of records) {
    const done = (o.clearance || []).filter((c: Raw) => c.done).map((c: Raw) => String(c.item));
    out[String(o._id)] = done;
  }
  return out;
}

export function exitStatusToApi(status: string): string | undefined {
  if (['Initiated', 'In Progress', 'Cleared', 'Completed'].includes(status)) return status;
  if (status === 'Exited') return 'Completed';
  if (status === 'Pending') return 'Initiated';
  return undefined;
}

export function mapTransfer(t: Raw): Transfer {
  return {
    id: String(t._id),
    employeeId: t.employee?.employeeId || '',
    fromDept: t.fromDepartment || '',
    toDept: t.toDepartment || '',
    fromLoc: t.fromLocation || '',
    toLoc: t.toLocation || '',
    effective: dateOnly(t.effectiveDate),
    reason: t.reason || '',
    approvedBy: t.approvedBy?.fullName || '',
  };
}

export function mapPromotion(t: Raw): Promotion {
  return {
    id: String(t._id),
    employeeId: t.employee?.employeeId || '',
    from: t.fromDesignation || t.fromDepartment || '',
    to: t.toDesignation || t.toDepartment || '',
    effective: dateOnly(t.effectiveDate),
    prevSalary: 0,
    newSalary: 0,
    reason: t.reason || '',
    approvedBy: t.approvedBy?.fullName || '',
  };
}

export function mapTraining(a: Raw): Training {
  const status =
    a.status === 'COMPLETED'
      ? 'Completed'
      : a.status === 'IN_PROGRESS'
        ? 'In Progress'
        : a.status === 'OVERDUE'
          ? 'Overdue'
          : 'Scheduled';
  return {
    id: String(a._id),
    name: a.training?.title || 'Training',
    employeeId: a.employee?.employeeId || '',
    trainer: a.assignedBy?.fullName || '',
    dept: a.employee?.department || '',
    start: '',
    end: dateOnly(a.dueDate),
    status,
    completion: a.status === 'COMPLETED' ? 100 : a.status === 'IN_PROGRESS' ? 50 : 0,
    certification: a.certificateFileKey ? 'Uploaded' : '',
  };
}

/* ---------------- platform ---------------- */

export function mapNotification(n: Raw): AppNotification {
  return {
    id: String(n._id),
    text: n.message || n.title || '',
    time: relativeTime(n.createdAt),
    read: !!n.read,
  };
}

export function mapAudit(l: Raw): AuditEntry {
  return {
    id: String(l._id),
    action: l.action || '',
    user: l.actorName || '',
    date: dateOnly(l.createdAt),
    time: clockOf(l.createdAt),
    record: l.targetId ? String(l.targetId) : l.description || '',
  };
}

/** Login-session GPS (the only location the server stores) → location log. */
export function mapSessionLocation(s: Raw): LocationRecord | null {
  if (!s || !s.gps || s.gps.latitude === undefined || s.gps.latitude === null) return null;
  return {
    id: `SESS-${s.id || s._id}`,
    kind: 'login',
    ref: String(s.id || s._id || ''),
    employeeId: s.employeeId || null,
    email: '',
    lat: Number(s.gps.latitude),
    lng: Number(s.gps.longitude),
    accuracy: Number(s.gps.accuracy || 0),
    capturedAt: s.gps.capturedAt ? new Date(s.gps.capturedAt).toISOString() : '',
  };
}

/* ---------------- derived: events & funnel ---------------- */

export function deriveEvents(
  leaves: LeaveRequest[],
  employees: Employee[],
  projects: Project[],
  holidays: { date: string; name: string }[],
): CalendarEvent[] {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name || id;
  const out: CalendarEvent[] = [];
  for (const h of holidays) {
    if (h.date >= today && h.date <= soon) {
      out.push({ day: h.date.slice(8, 10), month: MONTHS[Number(h.date.slice(5, 7)) - 1], title: h.name, detail: 'Company holiday' });
    }
  }
  for (const l of leaves) {
    if (l.status === 'Approved' && l.to >= today && l.from <= soon) {
      out.push({
        day: l.from.slice(8, 10),
        month: MONTHS[Number(l.from.slice(5, 7)) - 1],
        title: `${nameOf(l.employeeId)} on leave`,
        detail: `${l.type} · ${l.from}${l.to !== l.from ? ` → ${l.to}` : ''}`,
      });
    }
  }
  for (const p of projects) {
    if (p.end && p.end >= today && p.end <= soon && p.status !== 'Completed') {
      out.push({ day: p.end.slice(8, 10), month: MONTHS[Number(p.end.slice(5, 7)) - 1], title: `${p.name} due`, detail: 'Project end date' });
    }
  }
  return out.sort((a, b) => (`${a.month}${a.day}` < `${b.month}${b.day}` ? -1 : 1)).slice(0, 8);
}

export function deriveFunnel(candidates: Candidate[]): FunnelStage[] {
  const BUCKETS: Array<{ stage: string; color: string; match: string[] }> = [
    { stage: 'Applied', color: '#7FD4C1', match: ['Applied'] },
    { stage: 'Screening', color: '#63BBA8', match: ['Screening', 'Shortlisted'] },
    { stage: 'Interview', color: '#509888', match: ['Interview', 'Technical Round', 'HR Round'] },
    { stage: 'Offer', color: '#3F7A6E', match: ['Offer Sent', 'Offer Accepted'] },
    { stage: 'Joined', color: '#2F5D54', match: ['Selected', 'Hired'] },
  ];
  return BUCKETS.map((b) => ({
    stage: b.stage,
    color: b.color,
    count: candidates.filter((c) => c.stage !== 'Rejected' && b.match.includes(c.stage)).length,
  }));
}

/** Holidays are company configuration the server does not model yet. */
export function apiHolidays() {
  return HOLIDAYS.map((h) => ({ ...h }));
}

/* ---------------- Team Tasks ---------------- */

export function mapTeamTask(t: Raw): TeamTask {
  return {
    id: String(t._id),
    title: t.title || '',
    description: t.description || '',
    status: t.status || 'To Do',
    priority: t.priority || 'Medium',
    startDate: dateOnly(t.startDate),
    dueDate: dateOnly(t.dueDate),
    completedAt: t.completedAt ? dateOnly(t.completedAt) : null,
    assignedTo: (t.assignedTo || []).map((e: Raw) => e?.employeeId || String(e)).filter(Boolean),
    createdBy: t.createdBy?.employeeId || String(t.createdBy || ''),
    project: t.project ? String(t.project) : null,
    team: t.team || '',
    tags: t.tags || [],
    estimatedHours: Number(t.estimatedHours || 0),
    actualHours: Number(t.actualHours || 0),
    reminders: (t.reminders || []).map((r: Raw) => ({
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : '',
      type: r.type || 'deadline_approaching',
      sentTo: (r.sentTo || []).map((u: Raw) => String(u)),
    })),
    history: (t.history || []).map((h: Raw) => ({
      id: String(h._id || ''),
      action: h.action || '',
      performedBy: h.performedBy?.fullName || String(h.performedBy || ''),
      performedAt: h.performedAt ? new Date(h.performedAt).toISOString() : '',
      details: h.details || '',
      field: h.field || '',
      oldValue: h.oldValue || '',
      newValue: h.newValue || '',
    })),
    deletedAt: t.deletedAt ? dateOnly(t.deletedAt) : null,
    deletedBy: t.deletedBy ? String(t.deletedBy) : null,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : '',
    updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
  };
}
