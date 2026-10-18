/* ============================================================
   Mock backend — a persisted stand-in for the HR API.

   It answers the same calls a real backend would:
     POST /auth/login            → { accessToken, sessionId, user, expiresAt }
     GET  /auth/me               → session user
     POST /auth/logout           → the closed session record
     GET  /auth/session/activity → live session + recent history + server clock
     POST /activity/location     → one GPS capture

   Sign-in writes a login-session row, sign-out closes it, and every
   timestamp/duration is minted here (server clock) — the frontend
   never computes authoritative working time.

   Replace `src/api/client.ts` with a fetch wrapper and delete the
   mock: no component imports this file directly.
   ============================================================ */
import type { LocationRecord, LoginSessionRecord, Role, SessionActivity, SessionUser } from '@/types';
import { ALL_PAGES, allowedPages, portalForRole } from '@/data/nav';

export interface DemoCredential {
  email: string;
  password: string;
  role: Role;
  label: string;
}

/** Seeded credentials, shown on the login card for convenience. */
export const DEMO_CREDENTIALS: DemoCredential[] = [
  { email: 'superadmin@cyethack.com', password: 'Super@123', role: 'SUPER_ADMIN', label: 'Super Admin' },
  { email: 'admin@cyethack.com', password: 'Admin@123', role: 'ADMIN', label: 'HR Admin' },
  { email: 'jaya.sahu@cyethack.com', password: 'Welcome@123', role: 'HR', label: 'HR Manager' },
  { email: 'sanu@cyethack.com', password: 'Welcome@123', role: 'MANAGER', label: 'Manager' },
  { email: 'rohith.sai@cyethack.com', password: 'Welcome@123', role: 'EMPLOYEE', label: 'Employee' },
];

interface StoredAccount extends DemoCredential {
  employeeId: string | null;
}

const ACCOUNTS: StoredAccount[] = [
  { ...DEMO_CREDENTIALS[0], employeeId: 'CY0125JS201' },
  { ...DEMO_CREDENTIALS[1], employeeId: 'CY1016SI123' },
  { ...DEMO_CREDENTIALS[2], employeeId: 'CY0125JS201' },
  { ...DEMO_CREDENTIALS[3], employeeId: 'CY0824SD301' },
  { ...DEMO_CREDENTIALS[4], employeeId: 'CY0525RS109' },
];

export interface LoginPayload {
  accessToken: string;
  /** reference of the login-session row this sign-in created */
  sessionId: string;
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function delay(ms = 420): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/* ------------------------------------------------------------
   Token store — like a real server-side session store, it lives
   with the backend, so a page refresh never invalidates a
   remembered session or restarts the working-time counter.
   ------------------------------------------------------------ */
interface StoredSession {
  email: string;
  expiresAt: number;
  /** the login-session row this token belongs to */
  sessionId: string;
}

const SESSIONS_KEY = 'cyethackHRM.db.sessions';

function loadSessions(): Map<string, StoredSession> {
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, StoredSession>));
  } catch {
    return new Map();
  }
}

function saveSessions(): void {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(Object.fromEntries(sessions)));
  } catch {
    /* the demo backend degrades to in-memory */
  }
}

const sessions: Map<string, StoredSession> = loadSessions();

/* ------------------------------------------------------------
   Login sessions — the stand-in for the MongoDB `loginsessions`
   collection. One row per sign-in: opened with the server clock
   (`logoutAt: null`, status `Active`) and closed by sign-out with
   the server-computed duration.
   ------------------------------------------------------------ */
const LOGIN_SESSIONS_KEY = 'cyethackHRM.db.loginSessions';
const LOGIN_SESSIONS_MAX = 500;

function readLoginSessions(): LoginSessionRecord[] {
  try {
    const raw = window.localStorage.getItem(LOGIN_SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as LoginSessionRecord[]) : [];
  } catch {
    return [];
  }
}

function persistLoginSessions(rows: LoginSessionRecord[]): void {
  try {
    window.localStorage.setItem(LOGIN_SESSIONS_KEY, JSON.stringify(rows.slice(-LOGIN_SESSIONS_MAX)));
  } catch {
    /* the demo backend degrades to in-memory */
  }
}

function nextSessionRef(rows: LoginSessionRecord[]): string {
  const max = rows.reduce((m, r) => {
    const n = Number(String(r.id).replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 1000);
  return `SESS-${max + 1}`;
}

/** Close a login-session row with server time and duration. */
function closeSessionRecord(record: LoginSessionRecord, at: number): LoginSessionRecord {
  return { ...record, logoutAt: at, durationMs: Math.max(0, at - record.loginAt), status: 'Logged Out' };
}

/* ------------------------------------------------------------
   Activity locations — the stand-in for a real
   `POST /activity/location` writing one document per capture to
   the MongoDB collection `activitylocations`. Only one-shot
   captures made in direct response to a user action ever arrive
   here; nothing is streamed.
   ------------------------------------------------------------ */
const ACTIVITY_KEY = 'cyethackHRM.db.activityLocations';
const ACTIVITY_MAX = 200;

function readActivityDb(): LocationRecord[] {
  try {
    const raw = window.localStorage.getItem(ACTIVITY_KEY);
    return raw ? (JSON.parse(raw) as LocationRecord[]) : [];
  } catch {
    return [];
  }
}

function persistActivityDb(rows: LocationRecord[]): void {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(rows.slice(-ACTIVITY_MAX)));
  } catch {
    /* the demo backend degrades to in-memory */
  }
}

function mintToken(email: string): string {
  const rand = Math.random().toString(36).slice(2);
  return `demo.${btoa(email).replace(/=+$/, '')}.${rand}${Date.now().toString(36)}`;
}

function safeUser(account: StoredAccount): SessionUser {
  const nav = allowedPages(account.role) ?? ALL_PAGES;
  return {
    id: `USR-${account.role}`,
    employeeId: account.employeeId,
    name: account.label,
    email: account.email,
    role: account.role,
    department: 'Human Resources',
    designation: account.label,
    status: 'active',
    nav,
    portal: portalForRole(account.role),
  };
}

export const mockServer = {
  async login(email: string, password: string): Promise<LoginPayload> {
    await delay();
    const account = ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!account || account.password !== password) {
      throw new ApiError(401, 'Invalid email or password. Try one of the demo accounts below.');
    }
    const user = safeUser(account);
    const accessToken = mintToken(account.email);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + SESSION_TTL_MS;

    /* One row per sign-in, with the server clock. A stale active row
       for the same user (browser closed without signing out) is
       closed first so no session stays "Active" forever. */
    const rows = readLoginSessions();
    const closedStale = rows.map((r) =>
      r.userId === user.id && r.status === 'Active' ? closeSessionRecord(r, issuedAt) : r,
    );
    const record: LoginSessionRecord = {
      id: nextSessionRef(rows),
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role,
      loginAt: issuedAt,
      logoutAt: null,
      durationMs: null,
      status: 'Active',
    };
    persistLoginSessions([...closedStale, record]);

    /* One active sign-in per account: a fresh sign-in supersedes the
       account's earlier tokens (their rows are already closed above). */
    for (const [token, s] of sessions) {
      if (s.email === account.email) sessions.delete(token);
    }
    sessions.set(accessToken, { email: account.email, expiresAt, sessionId: record.id });
    saveSessions();
    return { accessToken, sessionId: record.id, user, issuedAt, expiresAt };
  },

  async me(accessToken: string): Promise<SessionUser> {
    await delay(220);
    const session = sessions.get(accessToken);
    if (!session) throw new ApiError(401, 'Session expired — please sign in again.');
    if (session.expiresAt < Date.now()) {
      sessions.delete(accessToken);
      saveSessions();
      throw new ApiError(401, 'Session expired — please sign in again.');
    }
    const account = ACCOUNTS.find((a) => a.email === session.email);
    if (!account) throw new ApiError(401, 'Account no longer exists.');
    return safeUser(account);
  },

  /**
   * Close the caller's login-session row with server time and return
   * it — the navbar shows the recorded logout time and duration.
   */
  async logout(accessToken: string): Promise<LoginSessionRecord | null> {
    await delay(160);
    const session = sessions.get(accessToken);
    sessions.delete(accessToken);
    saveSessions();
    if (!session) return null;
    const rows = readLoginSessions();
    const at = Date.now();
    let closed: LoginSessionRecord | null = null;
    const next = rows.map((r) => {
      if (r.id !== session.sessionId || r.status !== 'Active') return r;
      closed = closeSessionRecord(r, at);
      return closed;
    });
    if (closed) persistLoginSessions(next);
    return closed;
  },

  /**
   * The live session for the navbar panel: the caller's row, the
   * latest rows for the account, and the server clock at response
   * time — the anchor the running working-time counter ticks from.
   */
  async sessionActivity(accessToken: string): Promise<SessionActivity> {
    await delay(140);
    const session = sessions.get(accessToken);
    if (!session) throw new ApiError(401, 'Session expired — please sign in again.');
    const rows = readLoginSessions();
    const current = rows.find((r) => r.id === session.sessionId);
    if (!current) throw new ApiError(404, 'Session record not found.');
    const recent = rows
      .filter((r) => r.userId === current.userId)
      .sort((a, b) => b.loginAt - a.loginAt)
      .slice(0, 5);
    return { session: current, recent, serverNow: Date.now() };
  },

  /**
   * Persist one GPS capture. A real deployment validates the
   * session token and role here; the demo stores the document as
   * received so the frontend flow stays identical after the swap.
   */
  async recordLocation(record: LocationRecord): Promise<LocationRecord> {
    await delay(160);
    const valid =
      Number.isFinite(record.lat) &&
      Number.isFinite(record.lng) &&
      Math.abs(record.lat) <= 90 &&
      Math.abs(record.lng) <= 180 &&
      record.accuracy >= 0 &&
      Boolean(record.capturedAt) &&
      Boolean(record.ref);
    if (!valid) throw new ApiError(422, 'Invalid location payload.');
    const rows = readActivityDb();
    if (!rows.some((r) => r.id === record.id)) persistActivityDb([...rows, record]);
    return record;
  },
};
