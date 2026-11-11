/* ============================================================
   Domain types — one place that describes every entity in the
   HRM. The store, the API layer and every feature import from here.
   ============================================================ */

/* ---------------- Identity & access ---------------- */
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';
export type Portal = 'hr' | 'manager' | 'employee';

/** A person who can sign in. `employeeId` links them to the roster. */
export interface User {
  id: string;
  employeeId: string | null;
  name: string;
  email: string;
  role: Role;
  department: string;
  designation: string | null;
  status: 'active' | 'disabled';
}

/** What the server returns after login / on `/me` — safe projection. */
export interface SessionUser extends User {
  nav: string[];
  portal: Portal;
}

export interface Session {
  accessToken: string;
  user: SessionUser;
  issuedAt: number;
  /** milliseconds; how long this session stays valid */
  ttl: number;
}

/**
 * One row of login activity — the record the backend writes on sign-in
 * and closes on sign-out (stand-in for the MongoDB `loginsessions`
 * collection). Every timestamp is minted by the server clock; the
 * frontend only ever renders these values.
 */
export interface LoginSessionRecord {
  /** public session reference, e.g. `SESS-1004` (never a token) */
  id: string;
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  role: Role;
  /** server clock, epoch ms */
  loginAt: number;
  /** server clock, epoch ms; `null` while the session is active */
  logoutAt: number | null;
  /** server-computed session duration; `null` while active */
  durationMs: number | null;
  status: 'Active' | 'Logged Out';
}

/**
 * What the navbar session panel needs: the caller's live session, its
 * recent history and the server clock at the moment of the response —
 * the anchor the running working-time counter ticks from.
 */
export interface SessionActivity {
  session: LoginSessionRecord;
  /** latest sessions for this account, newest first */
  recent: LoginSessionRecord[];
  /** server clock, epoch ms, at response time */
  serverNow: number;
}

/* ---------------- People & org ---------------- */
export type EmployeeStatus = 'Active' | 'Probation' | 'On Leave' | 'Resigned' | 'Terminated';
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Intern';

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: 'Male' | 'Female' | 'Other';
  dob: string;
  dept: string;
  departmentId?: string;
  designation: string;
  designationId?: string;
  manager: string | null;
  location: string;
  employmentType: EmploymentType;
  joining: string;
  status: EmployeeStatus;
  probation: boolean;
  experience: string;
  /** monthly in-hand, ₹ — the portal stores no CTC breakdown by design */
  salary: number;
  grade: string;
  bloodGroup?: string;
  emergency?: string;
  address?: string;
}

export interface Department {
  id: string;
  name: string;
  head: string | null;
  budget: string;
  active: boolean;
}

export interface Designation {
  id: string;
  title: string;
  deptId: string;
  min: string;
  max: string;
}

/* ---------------- Recruitment ---------------- */
export interface Job {
  id: string;
  title: string;
  dept: string;
  designation: string;
  location: string;
  employmentType: EmploymentType;
  workMode: 'On-site' | 'Hybrid' | 'Remote';
  experience: string;
  qualification: string;
  skills: string;
  salMin: string;
  salMax: string;
  vacancies: number;
  deadline: string;
  recruiter: string;
  description: string;
  status: 'Draft' | 'Published' | 'Open' | 'On Hold' | 'Closed';
}

/** The pipeline order used by the candidate board and the Advance action. */
export const PIPELINE = [
  'Applied',
  'Screening',
  'Shortlisted',
  'Interview',
  'Technical Round',
  'HR Round',
  'Selected',
  'Offer Sent',
  'Offer Accepted',
  'Hired',
  'Rejected',
] as const;
export type CandidateStage = (typeof PIPELINE)[number];

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  qualification: string;
  experience: string;
  skills: string;
  jobId: string;
  applied: string;
  recruiter: string;
  source: string;
  stage: CandidateStage;
  notes: string;
}

export interface Interview {
  id: string;
  candidateId: string;
  type: string;
  date: string;
  time: string;
  interviewer: string;
  mode: 'Video' | 'On-site' | 'Phone';
  link: string;
  status: string;
  rating: string;
  feedback: string;
}

export interface Offer {
  id: string;
  candidateId: string;
  jobId: string;
  joining: string;
  salary: number;
  employmentType: EmploymentType;
  manager: string;
  offerDate: string;
  expiry: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired' | 'Withdrawn';
}

export interface Onboarding {
  id: string;
  candidateId: string;
  name: string;
  dept: string;
  joining: string;
  done: string[];
}

/* ---------------- Projects & work ---------------- */
export interface Project {
  id: string;
  name: string;
  client: string;
  dept: string;
  manager: string;
  start: string;
  end: string;
  budget: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Planning' | 'Not Started' | 'Active' | 'On Hold' | 'Completed' | 'Cancelled';
  progress: number;
  members: string[];
  description?: string;
}

export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Blocked' | 'Completed' | 'Overdue';
export const TASK_STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'Review', 'Blocked', 'Completed', 'Overdue'];

export interface Task {
  id: string;
  title: string;
  projectId: string;
  assignee: string;
  assignedBy: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  start: string;
  due: string;
  status: TaskStatus;
  progress: number;
  est: number;
  actual: number;
}

/* ---------------- Team Tasks (standalone calendar tasks) ---------------- */
export type TeamTaskStatus = 'To Do' | 'In Progress' | 'In Review' | 'Blocked' | 'Completed' | 'Cancelled';
export const TEAM_TASK_STATUSES: TeamTaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Blocked', 'Completed', 'Cancelled'];

export type TeamTaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent' | 'Critical';
export const TEAM_TASK_PRIORITIES: TeamTaskPriority[] = ['Low', 'Medium', 'High', 'Urgent', 'Critical'];

export interface TeamTask {
  id: string;
  title: string;
  description: string;
  status: TeamTaskStatus;
  priority: TeamTaskPriority;
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  assignedTo: string[]; // Employee IDs
  createdBy: string; // Employee ID
  project: string | null; // Project ID (optional)
  team: string; // Team/category for filtering
  tags: string[];
  estimatedHours: number;
  actualHours: number;
  reminders: Array<{
    sentAt: string;
    type: 'deadline_approaching' | 'overdue' | 'assigned' | 'due_today' | 'due_tomorrow';
    sentTo: string[];
  }>;
  history: Array<{
    id: string;
    action: string;
    performedBy: string;
    performedAt: string;
    details: string;
    field: string;
    oldValue: string;
    newValue: string;
  }>;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------------- Performance ---------------- */
export interface Target {
  id: string;
  employeeId: string;
  dept: string;
  name: string;
  kpi: string;
  target: number;
  achieved: number;
  unit: string;
  start: string;
  end: string;
  weightage: number;
  status: string;
}

export interface Review {
  id: string;
  employeeId: string;
  cycle: string;
  period: string;
  score: number;
  rating: string;
  manager: string;
  date: string;
  comments: string;
}

export interface Training {
  id: string;
  name: string;
  employeeId: string;
  trainer: string;
  dept: string;
  start: string;
  end: string;
  status: string;
  completion: number;
  certification: string;
}

export interface Promotion {
  id: string;
  employeeId: string;
  from: string;
  to: string;
  effective: string;
  prevSalary: number;
  newSalary: number;
  reason: string;
  approvedBy: string;
}

export interface Transfer {
  id: string;
  employeeId: string;
  fromDept: string;
  toDept: string;
  fromLoc: string;
  toLoc: string;
  effective: string;
  reason: string;
  approvedBy: string;
}

export interface ExitRecord {
  id: string;
  employeeId: string;
  resignationDate: string;
  lastDay: string;
  reason: string;
  noticePeriod: string;
  assetReturn: 'Pending' | 'Completed';
  clearance: 'Pending' | 'Completed';
  settlement: 'Pending' | 'Processed';
  status: string;
}

/* ---------------- Personal to-dos ---------------- */
export type TodoStatus = 'Pending' | 'Completed';

export interface Todo {
  id: string;
  employeeId: string;
  title: string;      // single word, max 50 chars
  notes: string;      // description, max 500 chars
  date: string;       // YYYY-MM-DD
  status: TodoStatus;
  createdAt: string;
}

/* ---------------- Documents, notice board, helpdesk ---------------- */
export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  /** employee/candidate id, or `null` for company-wide documents (manuals, circulars) */
  owner: string | null;
  uploaded: string;
  status: 'Pending' | 'Verified' | 'Signed';
  /* server sessions only — storage-side facts for the viewer */
  /** content type of the stored file (pdf, image, …) */
  mimeType?: string;
  /** size of the stored file in bytes */
  size?: number;
  /** `missing` when the stored bytes are gone; `deleted` for archived records */
  uploadStatus?: 'active' | 'missing' | 'deleted';
  /** Public reference (DOC-YYYY-NNNNNN) — download by reference instead of by record id. */
  referenceId?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author: string;
  date: string;
  pinned: boolean;
}

export interface Ticket {
  id: string;
  subject: string;
  category: string;
  message: string;
  by: string;
  date: string;
  status: 'Open' | 'In Progress' | 'Resolved';
}

/* ---------------- Transfer Tickets ---------------- */
export type TransferTicketStatus = 
  | 'Pending Current Manager Approval'
  | 'Pending Current HR Approval'
  | 'Pending Target HR Approval'
  | 'Pending Target Manager Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'Completed';

export interface TransferTicketApprovalStep {
  id: string;
  step: TransferTicketStatus;
  approverRole: 'MANAGER' | 'HR';
  approverType: 'current' | 'target';
  assignedTo: string | { id: string; fullName: string; email: string; employeeId: string };
  decidedBy?: string | { id: string; fullName: string; email: string; employeeId: string };
  decidedAt?: string;
  decision?: 'Approved' | 'Rejected';
  reason?: string;
  isSkipped: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransferTicketHistoryEntry {
  id: string;
  action: string;
  performedBy: string | { id: string; fullName: string; email: string; role: string };
  performedByRole: 'MANAGER' | 'HR' | 'EMPLOYEE';
  timestamp: string;
  details?: string;
  fromStatus?: string;
  toStatus?: string;
}

export interface TransferTicket {
  id: string;
  ticketNumber: string;
  employee: string | { 
    id: string; 
    employeeId: string; 
    fullName: string; 
    department: string; 
    designation: string; 
    manager?: string;
    assignedHrId?: string;
    user?: string | { id: string };
  };
  currentManager: string | { id: string; fullName: string; email: string; employeeId: string };
  currentHr: string | { id: string; fullName: string; email: string; employeeId: string };
  targetManager: string | { id: string; fullName: string; email: string; employeeId: string };
  targetHr: string | { id: string; fullName: string; email: string; employeeId: string };
  currentManagerEmployeeId: string;
  currentHrEmployeeId: string;
  targetManagerEmployeeId: string;
  targetHrEmployeeId: string;
  reason: string;
  businessJustification?: string;
  requestedEffectiveDate: string;
  supportingDocument?: string;
  requestedBy: string | { id: string; fullName: string; email: string; employeeId: string };
  requestedByRole: 'MANAGER';
  status: TransferTicketStatus;
  currentStep: TransferTicketStatus;
  approvalSteps: TransferTicketApprovalStep[];
  approvedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  rejectedBy?: string | { id: string; fullName: string; email: string; employeeId: string };
  cancelledBy?: string | { id: string; fullName: string; email: string; employeeId: string };
  rejectionReason?: string;
  cancellationReason?: string;
  history: TransferTicketHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverableEmployee {
  _id: string;
  employeeId: string;
  fullName: string;
  department: string;
  designation: string;
  currentManager: string;
  currentManagerName: string;
  currentHr: string;
  currentHrName: string;
}

export interface TransferTarget {
  _id: string;
  employeeId: string;
  fullName: string;
  email: string;
}

/* ---------------- Attendance & leave ---------------- */
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: string;
  from: string;
  to: string;
  days: number;
  halfDay: boolean;
  reason: string;
  emergencyContact?: string;
  appliedOn: string;
  status: LeaveStatus;
  managerNote: string;
  /** Who has authority to approve this request: 'Manager' or 'HR' */
  approvalAuthority: 'Manager' | 'HR';
  /** ISO date-time of the final decision (approve / reject / cancel), when decided */
  decidedAt?: string | null;
}

export type AttendanceStatus = 'present' | 'absent' | 'halfday' | 'half-day' | 'wfh' | 'leave' | 'outside-location';

export interface AttendanceRecord {
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  workingHours?: string;
  leaveType?: string;
  approvalStatus?: LeaveStatus;
  lateBy?: string;
  earlyOut?: string;
  overtime?: string;
}

/* ---------------- Mandatory attendance (server-backed) ---------------- */

/** Payload for POST /api/attendance/check-in */
export interface AttendanceCheckInPayload {
  consentGiven: boolean;
  lat: number;
  lng: number;
  accuracy?: number;
}

/** One heartbeat-derived session segment. */
export interface AttendanceSession {
  start: string;
  end: string | null;
  state: 'active' | 'paused';
  reason: string;
}

/** One pause/resume/lifecycle event. */
export interface AttendanceEvent {
  type: 'pause' | 'resume' | 'check-in' | 'check-out' | 'offline';
  reason: string;
  at: string;
  details?: Record<string, unknown>;
}

/** Geofence + session configuration (HR-managed). */
export interface AttendanceSettings {
  _id?: string;
  officeLat: number | null;
  officeLng: number | null;
  radiusMeters: number;
  workStart: string;
  workEnd: string;
  minActiveHours: number;
  blockOutsideLocation: boolean;
  idleMinutes: number;
  heartbeatIntervalSeconds: number;
  sessionTimeoutSeconds: number;
  updatedBy?: string;
  updatedAt?: string;
}

/** Server row for /api/attendance/me and /api/attendance list. */
export interface AttendanceRow {
  id: string;
  employee: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  checkInDetail?: {
    lat: number;
    lng: number;
    accuracy?: number;
    ip: string;
    device: string;
    capturedAt: string;
  };
  checkOutDetail?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    ip: string;
    device: string;
    capturedAt: string;
  };
  activeSeconds: number;
  pausedSeconds: number;
  lastHeartbeatAt?: string;
  geofence?: { inRange: boolean; distanceMeters: number };
  consentGiven: boolean;
  sessions?: AttendanceSession[];
}

/** Response from POST /api/attendance/heartbeat. */
export interface AttendanceHeartbeatResponse {
  attendance: AttendanceRow;
  activeSeconds: number;
  pausedSeconds: number;
  status: AttendanceStatus;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface LeaveBalance {
  total: number;
  used: number;
  casual: number;
  sick: number;
  paidEarned: number;
}

/* ---------------- Payroll ---------------- */
export interface PayrollRow {
  empId: string;
  basic: number;
  hra: number;
  conv: number;
  special: number;
  bonus: number;
  gross: number;
  pt: number;
  otherDed: number;
  ded: number;
  net: number;
  payStatus: 'Pending' | 'Paid';
  /** payout reference minted by the payment step; present on paid rows */
  txnRef?: string;
  /* ---- real-API projections (present only on official payslip rows) ---- */
  /** the server payslip document this row projects */
  officialId?: string;
  /** the server's own status: Draft | Approved | Processed | Paid */
  officialStatus?: string;
  payDate?: string;
  pf?: number;
  tds?: number;
  esi?: number;
}

export interface PayrollRun {
  id: string;
  period: string;
  status: 'Draft' | 'Calculated' | 'Approved' | 'Processed';
  rows: PayrollRow[];
  payDate: string;
  /** `'api'` when the run is grouped from official server payslips */
  source?: 'api';
}

/* ---------------- Platform ---------------- */
export interface AppNotification {
  id: string;
  text: string;
  time: string;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  user: string;
  date: string;
  time: string;
  record: string;
}

export interface CalendarEvent {
  day: string;
  month: string;
  title: string;
  detail: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  color: string;
}

/* ---------------- Geolocation (login & attendance) ---------------- */
export type GeoActivityKind = 'login' | 'check-in' | 'check-out';

/** A one-shot position fix captured from the browser (never streamed). */
export interface GeoPoint {
  lat: number;
  lng: number;
  /** horizontal accuracy in metres, as reported by the browser */
  accuracy: number;
  /** ISO timestamp of the fix itself */
  capturedAt: string;
}

/**
 * One stored location event: "where and when" a login or an
 * attendance action happened. Saved only when the browser grants
 * location permission — denial simply means no record.
 */
export interface LocationRecord extends GeoPoint {
  id: string;
  kind: GeoActivityKind;
  /** login session reference, or `employeeId|iso` for an attendance day */
  ref: string;
  employeeId: string | null;
  /** account that triggered the capture */
  email: string;
}

/* ---------------- The app data root ---------------- */
export interface AppData {
  version: number;
  employees: Employee[];
  departments: Department[];
  designations: Designation[];
  jobs: Job[];
  candidates: Candidate[];
  interviews: Interview[];
  offers: Offer[];
  onboarding: Onboarding[];
  onboardingItems: string[];
  projects: Project[];
  tasks: Task[];
  teamTasks: TeamTask[];
  targets: Target[];
  reviews: Review[];
  training: Training[];
  promotions: Promotion[];
  transfers: Transfer[];
  exits: ExitRecord[];
  exitItems: string[];
  exitChecklists: Record<string, string[]>;
  documents: DocumentRecord[];
  announcements: Announcement[];
  tickets: Ticket[];
  todos: Todo[];
  leaveRequests: LeaveRequest[];
  leaveBalance: LeaveBalance;
  attendanceOverrides: Record<string, AttendanceRecord>;
  /** one-shot GPS captures from login / check-in actions (may be empty) */
  locationLog: LocationRecord[];
  holidays: Holiday[];
  payrollRuns: PayrollRun[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  events: CalendarEvent[];
  funnel: FunnelStage[];
  /** signed-in employee for the self-service screens (mirrors the session) */
  currentUserId: string;
  /** sequence used to mint new ids such as LR-1026 / TCK-101 */
  seq: number;
}

export type NotificationPreference = 'dark' | 'light';
