/* ============================================================
   API bridge — real sessions, real data.

   For sessions issued by the HRM API (`source: 'api'`):
     · the store is hydrated from the authenticated, role-scoped
       endpoints (identity always comes from the token);
     · every store mutation a feature page performs is translated
       into the matching authenticated API call — the local store
       applies it optimistically while the call is in flight;
     · the affected collections are then re-fetched from the server,
       so the UI always settles on persisted truth (and an optimistic
       change is rolled back by that same re-fetch when the call
       fails).

   Demo sessions never touch this module — the reducer answers, and
   nothing below changes the existing demo behaviour.
   ============================================================ */
import type { AppData, AttendanceRecord, Employee, Role } from '@/types';
import type { AppAction, CollectionKey } from '@/store/reducer';
import { apiGet, apiGetOptional, apiSend, apiUpload, apiErrorMessage, ApiError } from '@/api/services/http';
import * as M from '@/api/realMap';
import { EXIT_ITEMS } from '@/data/seed';
import {
  beginMutation,
  endMutation,
  mutationInFlight,
  pushToast,
} from '@/store/mutationGate';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

export interface BridgeUser {
  role: Role;
  employeeId: string | null;
  name: string;
  email: string;
}

let user: BridgeUser | null = null;
let sinks: {
  dispatch: (action: AppAction) => void;
  getData: () => AppData;
} | null = null;

export function configureBridge(next: typeof sinks): void {
  sinks = next;
}

export function setBridgeUser(next: BridgeUser | null): void {
  user = next;
  if (!next) {
    rawEmployees = [];
    rawLeaves = [];
    rawPayroll = [];
    rawPerformance = [];
    rawProjects = [];
    rawHiring = [];
    rawTransfers = [];
  }
}

export function bridgeActive(): boolean {
  return !!user;
}

export function bridgeUser(): BridgeUser | null {
  return user;
}

/* ---------------- raw caches (for id translation) ---------------- */

let rawEmployees: Raw[] = [];
let rawLeaves: Raw[] = [];
let rawPayroll: Raw[] = [];
let rawPerformance: Raw[] = [];
let rawProjects: Raw[] = [];
let rawHiring: Raw[] = [];
let rawTransfers: Raw[] = [];

function employeeObjId(employeeId: string | null | undefined): string | null {
  if (!employeeId) return null;
  const found = rawEmployees.find((e) => e.employeeId === employeeId);
  return found ? String(found._id) : null;
}

function requireEmployeeObjId(employeeId: string | null | undefined): string {
  const id = employeeObjId(employeeId);
  if (!id) {
    throw new Error(`Employee ${employeeId || '(unknown)'} is not in your server scope.`);
  }
  return id;
}

function memberObjIds(ids: string[] | undefined): string[] {
  return (ids || []).map((id) => employeeObjId(id)).filter((v): v is string => !!v);
}

/* ---------------- fetch: one patch per module ---------------- */

async function fetchEmployeesPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ employees: Raw[] }>('/api/employees');
  rawEmployees = body.employees || [];
  const employees = rawEmployees.map(M.mapEmployee);
  const departments = M.deriveDepartments(employees);
  return { employees, departments, designations: M.deriveDesignations(employees, departments) };
}

async function fetchLeavesPatch(): Promise<Partial<AppData>> {
  const [leavesBody, balanceBody] = await Promise.all([
    apiGet<{ leaves: Raw[] }>('/api/leaves'),
    apiGetOptional<{ balances: Raw[] }>('/api/leaves/balance'),
  ]);
  rawLeaves = leavesBody.leaves || [];
  const patch: Partial<AppData> = { leaveRequests: rawLeaves.map(M.mapLeave) };
  if (balanceBody) {
    const by = (type: string) => balanceBody.balances.find((b) => b.type === type);
    const sum = (field: string) =>
      balanceBody.balances.reduce((acc, b) => acc + Number(b[field] || 0), 0);
    patch.leaveBalance = {
      total: sum('total'),
      used: sum('used'),
      casual: Number(by('Casual Leave')?.remaining || 0),
      sick: Number(by('Sick Leave')?.remaining || 0),
      paidEarned: Number(by('Earned Leave')?.remaining || 0),
    };
  }
  return patch;
}

async function fetchAttendancePatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ attendance: Raw[] }>('/api/attendance');
  const overrides: Record<string, AttendanceRecord> = {};
  for (const rec of body.attendance || []) {
    const mapped = M.mapAttendanceRecord(rec);
    if (mapped) overrides[mapped.key] = mapped.record;
  }
  return { attendanceOverrides: overrides };
}

async function fetchPayrollPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ payroll: Raw[] }>('/api/payroll');
  rawPayroll = body.payroll || [];
  return { payrollRuns: M.mapPayrollRuns(rawPayroll) };
}

async function fetchPerformancePatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ performance: Raw[] }>('/api/performance');
  rawPerformance = body.performance || [];
  return { reviews: rawPerformance.map(M.mapReview), targets: M.mapTargets(rawPerformance) };
}

async function fetchProjectsPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ projects: Raw[] }>('/api/projects');
  rawProjects = body.projects || [];
  return { projects: rawProjects.map(M.mapProject), tasks: rawProjects.flatMap((p) => M.mapTasks(p)) };
}

async function fetchHiringPatch(): Promise<Partial<AppData>> {
  const body = await apiGetOptional<{ hiring: Raw[] }>('/api/hiring');
  if (!body) return {};
  rawHiring = body.hiring || [];
  return { jobs: rawHiring.map(M.mapJob), candidates: M.mapCandidates(rawHiring) };
}

async function fetchNoticesPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ notices: Raw[] }>('/api/notices');
  return { announcements: (body.notices || []).map(M.mapAnnouncement) };
}

async function fetchHelpdeskPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ tickets: Raw[] }>('/api/helpdesk');
  return { tickets: (body.tickets || []).map(M.mapTicket) };
}

async function fetchDocumentsPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ documents: Raw[] }>('/api/documents');
  return { documents: (body.documents || []).map(M.mapDocument) };
}

/* ---------------- documents: upload + verify (server sessions) ----------------
 * The register form stays metadata-only (demo behaviour) — server uploads ask
 * for a file and go straight to POST /api/documents, which stores the bytes
 * in the configured file service and keeps metadata + permissions in MongoDB.
 */

export interface OfficialUploadInput {
  file: File;
  title?: string;
  /** server category, e.g. 'Company Document' */
  category: string;
  /** employeeId as shown in the UI — translated to the server's id. Omit for self. */
  ownerEmployeeId?: string | null;
  /** 'all' = visible to every employee (HR/Admin); others are forced private */
  visibility?: 'private' | 'hr' | 'all';
}

/** Upload one document to the server's file service (authenticated). */
export async function officialUploadDocument(input: OfficialUploadInput): Promise<void> {
  const fd = new FormData();
  fd.append('file', input.file);
  fd.append('title', (input.title || input.file.name).slice(0, 200));
  fd.append('category', input.category);
  if (input.ownerEmployeeId) fd.append('owner', requireEmployeeObjId(input.ownerEmployeeId));
  if (input.visibility) fd.append('visibility', input.visibility);
  await apiUpload('POST', '/api/documents', fd);
  await refetchKeys(['documents']);
}

/** Mark one register document verified (HR/Admin — enforced server-side). */
export async function officialVerifyDocument(id: string): Promise<void> {
  await apiSend('PUT', `/api/documents/${encodeURIComponent(id)}/verify`);
  await refetchKeys(['documents']);
}

async function fetchOffboardingPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ offboarding: Raw[] }>('/api/offboarding');
  const records = body.offboarding || [];
  return { exits: records.map(M.mapExit), exitChecklists: M.exitChecklistsFrom(records) };
}

async function fetchTransfersPatch(): Promise<Partial<AppData>> {
  const body = await apiGetOptional<{ transfers: Raw[] }>('/api/transfers');
  if (!body) return {};
  rawTransfers = body.transfers || [];
  const promotions = rawTransfers.filter((t) => t.type === 'Promotion');
  const rest = rawTransfers.filter((t) => t.type !== 'Promotion');
  return { promotions: promotions.map(M.mapPromotion), transfers: rest.map(M.mapTransfer) };
}

async function fetchTrainingPatch(): Promise<Partial<AppData>> {
  const body = await apiGetOptional<{ assignments: Raw[] }>('/api/training/assignments');
  if (!body) return {};
  return { training: (body.assignments || []).map(M.mapTraining) };
}

async function fetchNotificationsPatch(): Promise<Partial<AppData>> {
  const body = await apiGet<{ notifications: Raw[] }>('/api/notifications?limit=50');
  return { notifications: (body.notifications || []).map(M.mapNotification) };
}

async function fetchSessionsPatch(): Promise<Partial<AppData>> {
  const body = await apiGetOptional<{ sessions: Raw[] }>('/api/sessions');
  if (!body) return {};
  const locationLog = (body.sessions || [])
    .map((s) => M.mapSessionLocation(s))
    .filter((r): r is NonNullable<typeof r> => !!r);
  return { locationLog };
}

async function fetchAuditPatch(): Promise<Partial<AppData>> {
  const body = await apiGetOptional<{ logs: Raw[] }>('/api/audit');
  if (!body) return {};
  return { audit: (body.logs || []).map(M.mapAudit) };
}

async function fetchTeamTasksPatch(): Promise<Partial<AppData>> {
  const body = await apiGetOptional<{ tasks: Raw[] }>('/api/team-tasks');
  if (!body) return {};
  return { teamTasks: (body.tasks || []).map(M.mapTeamTask) };
}

type RefreshKey =
  | 'employees'
  | 'leaves'
  | 'attendance'
  | 'payroll'
  | 'performance'
  | 'projects'
  | 'hiring'
  | 'notices'
  | 'helpdesk'
  | 'documents'
  | 'offboarding'
  | 'transfers'
  | 'training'
  | 'notifications'
  | 'sessions'
  | 'audit'
  | 'teamTasks';

const FETCHERS: Record<RefreshKey, () => Promise<Partial<AppData>>> = {
  employees: fetchEmployeesPatch,
  leaves: fetchLeavesPatch,
  attendance: fetchAttendancePatch,
  payroll: fetchPayrollPatch,
  performance: fetchPerformancePatch,
  projects: fetchProjectsPatch,
  hiring: fetchHiringPatch,
  notices: fetchNoticesPatch,
  helpdesk: fetchHelpdeskPatch,
  documents: fetchDocumentsPatch,
  offboarding: fetchOffboardingPatch,
  transfers: fetchTransfersPatch,
  training: fetchTrainingPatch,
  notifications: fetchNotificationsPatch,
  sessions: fetchSessionsPatch,
  audit: fetchAuditPatch,
  teamTasks: fetchTeamTasksPatch,
};

/* ---------------- hydration ---------------- */

/** The collections the bridge owns — cleared the moment an API session
 *  starts, so no demo record can be mistaken for server data. */
export function emptyApiPatch(employeeId: string | null): Partial<AppData> {
  return {
    employees: [],
    departments: [],
    designations: [],
    jobs: [],
    candidates: [],
    interviews: [],
    offers: [],
    onboarding: [],
    projects: [],
    tasks: [],
    teamTasks: [],
    targets: [],
    reviews: [],
    training: [],
    promotions: [],
    transfers: [],
    exits: [],
    exitChecklists: {},
    documents: [],
    announcements: [],
    tickets: [],
    leaveRequests: [],
    leaveBalance: { total: 0, used: 0, casual: 0, sick: 0, paidEarned: 0 },
    attendanceOverrides: {},
    locationLog: [],
    payrollRuns: [],
    notifications: [],
    audit: [],
    events: [],
    funnel: [],
    currentUserId: employeeId || '',
  };
}

function keysForRole(): RefreshKey[] {
  const role = user?.role;
  const keys: RefreshKey[] = [
    'employees',
    'leaves',
    'attendance',
    'payroll',
    'performance',
    'projects',
    'notices',
    'helpdesk',
    'documents',
    'offboarding',
    'transfers',
    'training',
    'notifications',
    'sessions',
    'teamTasks',
  ];
  if (role === 'HR' || role === 'ADMIN' || role === 'SUPER_ADMIN') {
    keys.push('hiring', 'audit');
  }
  return keys;
}

function decorateDerived(patch: Partial<AppData>, current: AppData): Partial<AppData> {
  const out = { ...patch };
  const employees = out.employees ?? current.employees;
  const leaves = out.leaveRequests ?? current.leaveRequests;
  const projects = out.projects ?? current.projects;
  const candidates = out.candidates ?? current.candidates;
  if (out.employees || out.leaveRequests || out.projects) {
    out.events = M.deriveEvents(leaves, employees, projects, M.apiHolidays());
  }
  if (out.candidates || out.employees) {
    out.funnel = M.deriveFunnel(candidates);
  }
  if (user?.employeeId) out.currentUserId = user.employeeId;
  return out;
}

/** Full role-scoped hydration — every endpoint is optional-safe: a module the
 *  role cannot read simply contributes nothing. */
export async function hydrateAll(): Promise<Partial<AppData>> {
  const keys = keysForRole();
  const results = await Promise.allSettled(keys.map((k) => FETCHERS[k]()));
  const patch: Partial<AppData> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') Object.assign(patch, r.value);
  }
  const current = sinks?.getData();
  return decorateDerived(patch, current ?? ({ ...emptyApiPatch(user?.employeeId ?? null) } as AppData));
}

/** Re-fetch exactly the collections a mutation touched. */
export async function refetchKeys(keys: RefreshKey[]): Promise<void> {
  const unique = Array.from(new Set(keys));
  const results = await Promise.allSettled(unique.map((k) => FETCHERS[k]()));
  const patch: Partial<AppData> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') Object.assign(patch, r.value);
  }
  const current = sinks?.getData();
  if (!current) return;
  const decorated = decorateDerived(patch, current);
  sinks?.dispatch({ type: 'set', patch: decorated });
}

/* ---------------- payroll console: official run actions ---------------- */

/** The dossier of employees a run covers: the scoped, on-roll roster. */
function onRollEmployees(): Raw[] {
  return rawEmployees.filter((e) =>
    ['Active', 'Probation', 'On Leave'].includes(String(e.status || 'Active')),
  );
}

/**
 * Draft the period: one slug per on-roll employee in the caller's scope.
 * `regenerate` overwrites an existing payslip (the server's explicit
 * regenerate flag) — used by "Recalculate". Employees the server cannot
 * pay (no salary structure and no base salary) are reported, not hidden.
 */
export async function officialGenerateRun(
  period: string,
  regenerate: boolean,
): Promise<{ created: number; skipped: number }> {
  const targets = onRollEmployees();
  if (!targets.length) {
    throw new Error('No employees on the pay register are in your scope.');
  }
  let created = 0;
  let firstError = '';
  for (const e of targets) {
    try {
      await apiSend('POST', '/api/payroll/generate', {
        employee: String(e._id),
        period,
        regenerate,
      });
      created += 1;
    } catch (err) {
      if (!firstError) firstError = apiErrorMessage(err);
    }
  }
  if (created === 0) {
    throw new Error(firstError || 'No payslips could be drafted for this period.');
  }
  await refetchKeys(['payroll']);
  return { created, skipped: targets.length - created };
}

/** Approve the given payslips (Draft → Approved). */
export async function officialApproveRun(slipIds: string[]): Promise<number> {
  if (!slipIds.length) throw new Error('Nothing to approve in this run.');
  for (const id of slipIds) {
    await apiSend('PUT', `/api/payroll/${id}`, { status: 'Approved' });
  }
  await refetchKeys(['payroll']);
  return slipIds.length;
}

/** Process the given payslips (→ Processed, pay date set). No refs are minted. */
export async function officialProcessRun(slipIds: string[], payDate: string): Promise<number> {
  if (!slipIds.length) throw new Error('Nothing to process in this run.');
  for (const id of slipIds) {
    await apiSend('PUT', `/api/payroll/${id}`, { status: 'Processed', payDate });
  }
  await refetchKeys(['payroll']);
  return slipIds.length;
}

/** Adjust an official payslip (gross increment / other deductions). */
export async function officialUpdateSlip(
  id: string,
  patch: { gross?: number; deductions?: { other?: number } },
): Promise<void> {
  await apiSend('PUT', `/api/payroll/${id}`, patch);
  await refetchKeys(['payroll']);
}

/* ---------------- action classification ---------------- */

const HANDLED: Record<string, RefreshKey[]> = {
  employees: ['employees'],
  leaveRequests: ['leaves'],
  announcements: ['notices'],
  tickets: ['helpdesk'],
  jobs: ['hiring'],
  candidates: ['hiring'],
  projects: ['projects'],
  tasks: ['projects'],
  teamTasks: ['teamTasks'],
  targets: ['performance'],
  reviews: ['performance'],
  promotions: ['transfers'],
  transfers: ['transfers'],
  exits: ['offboarding'],
  documents: ['documents'],
  payrollRuns: ['payroll'],
};

const NO_API_COLLECTIONS = new Set(['interviews', 'offers', 'onboarding']);

/** Collections that are browser-local configuration (the server has no API). */
const LOCAL_CONFIG_COLLECTIONS = new Set(['departments', 'designations']);

const UNSUPPORTED_MESSAGES: Array<{
  match: (action: AppAction) => boolean;
  message: string;
}> = [
  {
    match: (a) => a.type === 'add' && a.collection === 'documents',
    message:
      'Use the “Upload document” button — documents need a file, and this quick-add form only stores metadata.',
  },
  {
    match: (a) => a.type === 'update' && a.collection === 'documents',
    message: 'Use the row’s Verify action — server documents do not accept free-form edits.',
  },
  {
    match: (a) => a.type === 'add' && a.collection === 'targets',
    message:
      'KPI targets live inside performance reviews on the server — add goals from a review record instead.',
  },
  {
    match: (a) => (a.type === 'add' || a.type === 'update') && a.collection === 'training',
    message: 'Training records are assigned by the server — this edit is not available yet.',
  },
  {
    match: (a) => (a.type === 'add' || a.type === 'update') && a.collection === 'payrollRuns',
    message: 'Payroll runs are derived from official payslips — use the payslip actions instead.',
  },
  {
    match: (a) => a.type === 'remove' && a.collection === 'payrollRuns',
    message: 'Deleting payroll history is not available on the server.',
  },
  {
    match: (a) =>
      a.type === 'update' &&
      a.collection === 'exits' &&
      ('assetReturn' in a.patch || 'settlement' in a.patch),
    message: 'Asset-return and settlement tracking are not stored by the server yet.',
  },
];

export function unsupportedMessage(action: AppAction): string | null {
  for (const rule of UNSUPPORTED_MESSAGES) {
    if (rule.match(action)) return rule.message;
  }
  if (action.type === 'override') {
    const [empId] = action.key.split('|');
    if (empId && user?.employeeId && empId !== user.employeeId) {
      return 'Only your own attendance can be recorded from this portal.';
    }
    if (!employeeObjId(empId)) return 'Your employee record is not linked to this account.';
  }
  return null;
}

/** A page-local configuration write (kept in the browser, clearly flagged). */
export function localConfigMessage(action: AppAction): string | null {
  if (action.type === 'add' || action.type === 'update') {
    if (LOCAL_CONFIG_COLLECTIONS.has(action.collection)) {
      return 'Departments and designations are browser-local configuration — the server has no API for them yet.';
    }
  }
  if (action.type === 'set' && action.patch.holidays) {
    return 'The holiday calendar is browser-local configuration — the server has no holidays API yet.';
  }
  return null;
}

/** Does this action go to the server at all? */
export function bridgedAction(action: AppAction): boolean {
  switch (action.type) {
    case 'add':
    case 'update':
    case 'remove':
      return (
        action.collection in HANDLED ||
        NO_API_COLLECTIONS.has(action.collection) ||
        LOCAL_CONFIG_COLLECTIONS.has(action.collection)
      );
    case 'override':
      return true;
    case 'set': {
      const keys = Object.keys(action.patch);
      return keys.some((k) => k === 'notifications' || k === 'exitChecklists' || k === 'audit');
    }
    case 'reset':
      return false;
  }
}

/* ---------------- payload builders ---------------- */

const EMPLOYEE_FIELD_MAP: Record<string, string> = {
  name: 'fullName',
  dept: 'department',
  joining: 'joiningDate',
  emergency: 'emergencyContact',
};

const EMPLOYEE_API_FIELDS = new Set([
  'employeeId',
  'fullName',
  'email',
  'phone',
  'gender',
  'department',
  'designation',
  'manager',
  'employmentType',
  'workMode',
  'bloodGroup',
  'assignedHrId',
  'location',
  'joiningDate',
  'salary',
  'grade',
  'status',
  'user',
]);

function employeePatchToApi(patch: Record<string, unknown>): Raw {
  const out: Raw = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const apiKey = EMPLOYEE_FIELD_MAP[key] || key;
    if (!EMPLOYEE_API_FIELDS.has(apiKey)) continue;
    out[apiKey] = key === 'status' && value === 'Resigned' ? 'Exited' : value;
  }
  return out;
}

const SELF_PROFILE_FIELDS = new Set(['phone', 'address', 'location', 'emergency', 'bloodGroup']);

function employeeCreateToApi(e: Employee): Raw {
  return {
    employeeId: e.id,
    fullName: e.name,
    email: e.email || undefined,
    phone: e.phone || undefined,
    gender: e.gender || undefined,
    department: e.dept || undefined,
    designation: e.designation || undefined,
    manager: e.manager || undefined,
    employmentType: e.employmentType || undefined,
    location: e.location || undefined,
    joiningDate: e.joining || undefined,
    salary: e.salary || undefined,
    grade: e.grade || undefined,
    status: e.status === 'Probation' ? 'Probation' : 'Active',
  };
}

function jobToApi(j: Record<string, unknown>): Raw {
  const status = j.status === 'Closed' ? 'Closed' : j.status === 'On Hold' ? 'On Hold' : 'Open';
  return {
    jobId: String(j.id || `JOB-${Date.now()}`),
    title: j.title || undefined,
    department: j.dept || undefined,
    location: j.location || undefined,
    openings: Number(j.vacancies || 1),
    description: j.description || undefined,
    status,
  };
}

function projectStatusToApi(s: unknown): string {
  return ['Planning', 'Active', 'On Hold', 'Completed'].includes(String(s)) ? String(s) : 'Planning';
}

function projectToApi(p: Record<string, unknown>): Raw {
  return {
    name: p.name || undefined,
    description: p.description || undefined,
    status: p.status === undefined ? undefined : projectStatusToApi(p.status),
    manager: employeeObjId(p.manager as string) || undefined,
    members: memberObjIds(p.members as string[]),
    startDate: (p.start as string) || undefined,
    endDate: (p.end as string) || undefined,
    progress: p.progress === undefined ? undefined : Number(p.progress),
  };
}

function taskToApi(t: Record<string, unknown>): Raw {
  return {
    title: t.title || undefined,
    assignee: employeeObjId(t.assignee as string) || undefined,
    status: M.taskStatusToApi(String(t.status || 'To Do')),
    due: (t.due as string) || undefined,
  };
}

function candidateToApi(c: Record<string, unknown>): Raw {
  return {
    name: c.name || undefined,
    email: c.email || undefined,
    stage: M.stageToApi(String(c.stage || 'Applied')),
    source: (c.source as string) || undefined,
  };
}

function findHiringOf(candidateId: string): { hiring: Raw; index: number } {
  const [hiringId, idx] = candidateId.split(':');
  const hiring = rawHiring.find((h) => String(h._id) === hiringId);
  const index = Number(idx);
  if (!hiring || Number.isNaN(index)) throw new Error('Candidate not found on the server.');
  return { hiring, index };
}

function ticketCategory(category: unknown): string {
  const known = ['IT', 'HR', 'Payroll', 'Facilities', 'Other'];
  const value = String(category || '');
  if (known.includes(value)) return value;
  const lowered = value.toLowerCase();
  for (const k of known) if (lowered.includes(k.toLowerCase())) return k;
  return 'Other';
}

/* ---------------- mutation translation ---------------- */

async function runMutation(action: AppAction): Promise<void> {
  switch (action.type) {
    case 'add':
      return runAdd(action.collection, action.item as Raw);
    case 'update':
      return runUpdate(action.collection, action.id, action.patch as Raw);
    case 'remove':
      return runRemove(action.collection, action.id);
    case 'override':
      return runOverride(action.key, action.record);
    case 'set':
      return runSet(action.patch as Raw);
    case 'reset':
      return;
  }
}

async function runAdd(collection: CollectionKey, item: Raw): Promise<void> {
  switch (collection) {
    case 'employees': {
      const body = employeeCreateToApi(item as unknown as Employee);
      if (!body.employeeId || !body.fullName) {
        throw new Error('employeeId and full name are required.');
      }
      await apiSend('POST', '/api/employees', body);
      return;
    }
    case 'leaveRequests': {
      await apiSend('POST', '/api/leaves', {
        type: M.leaveTypeToApi(String(item.type || 'Casual Leave')),
        from: item.from,
        to: item.to,
        days: Number(item.days || 1),
        halfDay: !!item.halfDay,
        reason: item.reason || undefined,
        approvalAuthority: item.approvalAuthority || 'Manager',
      });
      return;
    }
    case 'announcements': {
      await apiSend('POST', '/api/notices', {
        title: item.title,
        body: item.body,
        pinned: !!item.pinned,
        audience: 'all',
        status: 'Published',
      });
      return;
    }
    case 'tickets': {
      await apiSend('POST', '/api/helpdesk', {
        subject: item.subject,
        description: item.message,
        category: ticketCategory(item.category),
        priority: 'Medium',
      });
      return;
    }
    case 'jobs': {
      await apiSend('POST', '/api/hiring', jobToApi(item));
      return;
    }
    case 'candidates': {
      const hiring = rawHiring.find((h) => String(h._id) === String(item.jobId));
      if (!hiring) throw new Error('Job opening not found on the server.');
      const candidates = [...(hiring.candidates || []).map((c: Raw) => candidateToApi(c)), candidateToApi(item)];
      await apiSend('PUT', `/api/hiring/${hiring._id}`, { candidates });
      return;
    }
    case 'projects': {
      await apiSend('POST', '/api/projects', projectToApi(item));
      return;
    }
    case 'tasks': {
      const project = rawProjects.find((p) => String(p._id) === String(item.projectId));
      if (!project) throw new Error('Project not found on the server.');
      const tasks = [...(project.tasks || []).map((t: Raw) => taskToApi(t)), taskToApi(item)];
      await apiSend('PUT', `/api/projects/${project._id}`, { tasks });
      return;
    }
    case 'reviews': {
      await apiSend('POST', '/api/performance', {
        employee: requireEmployeeObjId(item.employeeId),
        cycle: item.cycle || item.period || String(new Date().getFullYear()),
        rating: M.ratingToNumber(item.rating, item.score),
        managerFeedback: item.comments || undefined,
        status: 'Finalized',
      });
      return;
    }
    case 'promotions': {
      await apiSend('POST', '/api/transfers', {
        employee: requireEmployeeObjId(item.employeeId),
        type: 'Promotion',
        fromDesignation: item.from || undefined,
        toDesignation: item.to || undefined,
        effectiveDate: item.effective || undefined,
        reason: item.reason || undefined,
        status: 'Pending',
      });
      return;
    }
    case 'transfers': {
      await apiSend('POST', '/api/transfers', {
        employee: requireEmployeeObjId(item.employeeId),
        type: 'Transfer',
        toDepartment: item.toDept || undefined,
        toLocation: item.toLoc || undefined,
        effectiveDate: item.effective || undefined,
        reason: item.reason || undefined,
        status: 'Pending',
      });
      return;
    }
    case 'exits': {
      await apiSend('POST', '/api/offboarding', {
        employee: requireEmployeeObjId(item.employeeId),
        reason: ['Resignation', 'Termination', 'End of Contract', 'Retirement', 'Other'].includes(
          String(item.reason),
        )
          ? item.reason
          : 'Resignation',
        lastWorkingDate: item.lastDay || undefined,
        notes: item.noticePeriod ? `Notice period: ${item.noticePeriod}` : undefined,
      });
      return;
    }
    case 'teamTasks': {
      await apiSend('POST', '/api/team-tasks', {
        title: item.title,
        description: item.description,
        status: item.status,
        priority: item.priority,
        startDate: item.startDate,
        dueDate: item.dueDate,
        assignedTo: item.assignedTo.map((id: string) => requireEmployeeObjId(id)),
        team: item.team,
        project: item.project,
        tags: item.tags,
        estimatedHours: item.estimatedHours,
      });
      return;
    }
    default: {
      if (NO_API_COLLECTIONS.has(collection as string)) {
        throw new Error('This recruitment step is not stored by the server yet.');
      }
      throw new Error('This action is not available for server sessions yet.');
    }
  }
}

async function runUpdate(collection: CollectionKey, id: string, patch: Raw): Promise<void> {
  switch (collection) {
    case 'employees': {
      const keys = Object.keys(patch);
      const self = user?.employeeId && id === user.employeeId;
      const selfOnly = keys.length > 0 && keys.every((k) => SELF_PROFILE_FIELDS.has(k));
      if (self && selfOnly) {
        await apiSend('PUT', '/api/employees/me/profile', {
          phone: patch.phone,
          address: patch.address,
          location: patch.location,
          emergencyContact: patch.emergency,
        });
        return;
      }
      await apiSend('PUT', `/api/employees/${id}`, employeePatchToApi(patch));
      return;
    }
    case 'leaveRequests': {
      await apiSend('PUT', `/api/leaves/${id}`, {
        status: patch.status,
        managerNote: patch.managerNote,
      });
      return;
    }
    case 'announcements': {
      await apiSend('PUT', `/api/notices/${id}`, {
        title: patch.title,
        body: patch.body,
        pinned: patch.pinned,
      });
      return;
    }
    case 'tickets': {
      await apiSend('PUT', `/api/helpdesk/${id}`, { status: patch.status });
      return;
    }
    case 'jobs': {
      await apiSend('PUT', `/api/hiring/${id}`, jobToApi({ ...patch, id }));
      return;
    }
    case 'candidates': {
      const { hiring, index } = findHiringOf(id);
      const merged = { ...((hiring.candidates || [])[index] || {}), ...patch };
      const candidates = (hiring.candidates || []).map((c: Raw, i: number) =>
        i === index ? candidateToApi(merged) : candidateToApi(c),
      );
      await apiSend('PUT', `/api/hiring/${hiring._id}`, { candidates });
      return;
    }
    case 'projects': {
      await apiSend('PUT', `/api/projects/${id}`, projectToApi(patch));
      return;
    }
    case 'tasks': {
      const project = rawProjects.find((p) => (p.tasks || []).some((t: Raw, i: number) =>
        String(t._id || `${p._id}:${i}`) === id,
      ));
      if (!project) throw new Error('Task not found on the server.');
      if (Object.keys(patch).length === 1 && patch.status !== undefined) {
        await apiSend('PUT', `/api/projects/${project._id}/tasks/${id.split(':').length > 1 ? id.split(':')[1] : id}`, {
          status: M.taskStatusToApi(String(patch.status)),
        });
        return;
      }
      const tasks = (project.tasks || []).map((t: Raw, i: number) => {
        const tid = String(t._id || `${project._id}:${i}`);
        return taskToApi(tid === id ? { ...t, ...patch } : t);
      });
      await apiSend('PUT', `/api/projects/${project._id}`, { tasks });
      return;
    }
    case 'targets': {
      const [perfId, idxText] = id.split(':');
      const perf = rawPerformance.find((p) => String(p._id) === perfId);
      const index = Number(idxText);
      if (!perf || Number.isNaN(index)) throw new Error('Performance record not found on the server.');
      const goals = (perf.goals || []).map((g: Raw, i: number) => {
        if (i !== index) return { title: g.title, weightage: g.weightage, target: g.target, achieved: g.achieved, status: g.status };
        return {
          title: g.title,
          weightage: g.weightage,
          target: g.target,
          achieved: patch.achieved !== undefined ? String(patch.achieved) : g.achieved,
          status: patch.status !== undefined ? String(patch.status) : g.status,
        };
      });
      await apiSend('PUT', `/api/performance/${perfId}`, { goals });
      return;
    }
    case 'reviews': {
      await apiSend('PUT', `/api/performance/${id}`, {
        rating: M.ratingToNumber(patch.rating, patch.score),
        managerFeedback: patch.comments,
        cycle: patch.cycle || patch.period,
      });
      return;
    }
    case 'exits': {
      const body: Raw = {};
      if (patch.status !== undefined) {
        body.status = M.exitStatusToApi(String(patch.status)) || 'Completed';
      }
      if (patch.clearance === 'Completed') {
        body.clearance = EXIT_ITEMS.map((item) => ({ item, done: true }));
      }
      await apiSend('PUT', `/api/offboarding/${id}`, body);
      return;
    }
    case 'teamTasks': {
      const updateBody: Raw = {};
      if (patch.title !== undefined) updateBody.title = patch.title;
      if (patch.description !== undefined) updateBody.description = patch.description;
      if (patch.status !== undefined) updateBody.status = patch.status;
      if (patch.priority !== undefined) updateBody.priority = patch.priority;
      if (patch.startDate !== undefined) updateBody.startDate = patch.startDate;
      if (patch.dueDate !== undefined) updateBody.dueDate = patch.dueDate;
      if (patch.assignedTo !== undefined) updateBody.assignedTo = patch.assignedTo.map((id: string) => requireEmployeeObjId(id));
      if (patch.team !== undefined) updateBody.team = patch.team;
      if (patch.project !== undefined) updateBody.project = patch.project;
      if (patch.tags !== undefined) updateBody.tags = patch.tags;
      if (patch.estimatedHours !== undefined) updateBody.estimatedHours = patch.estimatedHours;
      if (patch.actualHours !== undefined) updateBody.actualHours = patch.actualHours;
      await apiSend('PUT', `/api/team-tasks/${id}`, updateBody);
      return;
    }
    default:
      if (NO_API_COLLECTIONS.has(collection as string)) return; // server has no store for this module
      throw new Error('This edit is not available for server sessions yet.');
  }
}

async function runRemove(collection: CollectionKey, id: string): Promise<void> {
  switch (collection) {
    case 'employees':
      await apiSend('DELETE', `/api/employees/${id}`);
      return;
    case 'leaveRequests':
      await apiSend('DELETE', `/api/leaves/${id}`);
      return;
    case 'announcements':
      await apiSend('DELETE', `/api/notices/${id}`);
      return;
    case 'documents':
      await apiSend('DELETE', `/api/documents/${id}`);
      return;
    case 'promotions':
    case 'transfers':
      await apiSend('PUT', `/api/transfers/${id}`, { status: 'Implemented' });
      return;
    case 'tasks': {
      const project = rawProjects.find((p) =>
        (p.tasks || []).some((t: Raw, i: number) => String(t._id || `${p._id}:${i}`) === id),
      );
      if (!project) throw new Error('Task not found on the server.');
      const tasks = (project.tasks || [])
        .filter((t: Raw, i: number) => String(t._id || `${project._id}:${i}`) !== id)
        .map((t: Raw) => taskToApi(t));
      await apiSend('PUT', `/api/projects/${project._id}`, { tasks });
      return;
    }
    case 'teamTasks': {
      await apiSend('DELETE', `/api/team-tasks/${id}`);
      return;
    }
    default:
      throw new Error('This removal is not available for server sessions yet.');
  }
}

async function runOverride(key: string, record: AttendanceRecord): Promise<void> {
  const [empId] = key.split('|');
  if (!empId || !user?.employeeId || empId !== user.employeeId) {
    throw new Error('Only your own attendance can be recorded from this portal.');
  }
  if (record.checkOut) {
    await apiSend('POST', '/api/attendance/check-out');
  } else {
    await apiSend('POST', '/api/attendance/check-in', {
      status: record.status === 'wfh' ? 'wfh' : 'present',
    });
  }
}

async function runSet(patch: Raw): Promise<void> {
  if (patch.notifications !== undefined) {
    await apiSend('PUT', '/api/notifications/read-all');
    return;
  }
  if (patch.exitChecklists !== undefined) {
    const current = sinks?.getData();
    const lists = patch.exitChecklists as Record<string, string[]>;
    const ids = Object.keys(lists);
    for (const exitId of ids) {
      const previous = current?.exitChecklists[exitId] || [];
      const next = lists[exitId] || [];
      if (previous.length === next.length && previous.every((v, i) => v === next[i])) continue;
      await apiSend('PUT', `/api/offboarding/${exitId}`, {
        clearance: EXIT_ITEMS.map((item) => ({ item, done: next.includes(item) })),
      });
    }
    return;
  }
  if (patch.audit !== undefined) return; // the server keeps its own audit trail
}

/** Refresh plan for a mutation — which collections to re-read afterwards. */
function refreshPlan(action: AppAction): RefreshKey[] {
  switch (action.type) {
    case 'add':
    case 'update':
    case 'remove': {
      const plans = HANDLED[action.collection];
      return plans ? [...plans] : [];
    }
    case 'override':
      return ['attendance'];
    case 'set': {
      if (action.patch.notifications !== undefined) return ['notifications'];
      if (action.patch.exitChecklists !== undefined) return ['offboarding'];
      return [];
    }
    default:
      return [];
  }
}

/**
 * Execute one bridged mutation. Called by the store adapter AFTER the
 * optimistic local apply; resolves once the server has confirmed.
 * Throws with the server's safe message when the call fails.
 */
export async function executeMutation(action: AppAction): Promise<void> {
  await runMutation(action);
}

/**
 * The full adapter: optimistic apply → server call → role-scoped refresh.
 * Used by AppProvider's `dispatch`.
 */
export function dispatchBridged(action: AppAction, rawDispatch: (a: AppAction) => void): void {
  const unsupported = unsupportedMessage(action);
  if (unsupported) {
    pushToast(unsupported, 'error');
    return;
  }
  const localConfig = localConfigMessage(action);
  rawDispatch(action); // optimistic (and final, for local-config writes)
  if (localConfig) {
    pushToast(localConfig, 'info');
    return;
  }
  beginMutation();
  const plan = refreshPlan(action);
  void executeMutation(action)
    .then(async () => {
      if (plan.length) {
        try {
          await refetchKeys(plan);
        } catch {
          /* the write succeeded; a refresh miss must not report failure */
        }
      }
      endMutation(true);
    })
    .catch(async (err) => {
      pushToast(apiErrorMessage(err), 'error');
      try {
        await refetchKeys(plan);
      } catch {
        /* rollback is best-effort */
      }
      endMutation(false);
    });
}

export { mutationInFlight, ApiError };
