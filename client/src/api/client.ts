/* ============================================================
   API client — the only module the app talks to.

   Two backends answer the same calls:
     · the real HRM API (`/api/*`: JWT access token + httpOnly
       refresh cookie) — used whenever the server is reachable and
       the account is real;
     · the built-in demo backend (`mockServer`) — used for the
       seeded demo credentials, offline previews and any account
       the API does not know.

   Sign-in tries the real API first: real accounts get a real
   session (so official server data — e.g. payslip PDFs — is
   available), otherwise the demo answers and the session is
   flagged `demo` so feature modules can pick the right source.
   ============================================================ */
import type { LocationRecord, LoginSessionRecord, SessionActivity, SessionUser } from '@/types';
import { ApiError } from '@/api/mockServer';

const REMEMBER_KEY = 'cyethackHRM.session.remembered';
const SESSION_KEY = 'cyethackHRM.session';

/** Which backend issued a stored session. */
export type SessionSource = 'api' | 'demo';

export interface LoginPayload {
  accessToken: string;
  sessionId: string;
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
}

export interface StoredSession extends LoginPayload {
  /**
   * `'api'` — a real HRM-API session: official server data and
   * documents (payslip PDFs) are available.
   * `'demo'` — the built-in demo backend.
   */
  source: SessionSource;
}

function readRaw(fromLocal: boolean): string | null {
  try {
    return fromLocal ? window.localStorage.getItem(SESSION_KEY) : window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** The storage area the current session was remembered in. */
function currentArea(): 'local' | 'session' {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === '1' ? 'local' : 'session';
  } catch {
    return 'session';
  }
}

/** The current session, from either storage area, if still valid. */
export function readSession(): StoredSession | null {
  const remembered = (() => {
    try {
      return window.localStorage.getItem(REMEMBER_KEY) === '1';
    } catch {
      return false;
    }
  })();
  const raw = readRaw(remembered) ?? readRaw(!remembered);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    const source: SessionSource = parsed.source === 'api' ? 'api' : 'demo';
    if (parsed.expiresAt < Date.now() && source === 'demo') {
      // Demo tokens cannot be renewed — an expired one is dead.
      clearSession();
      return null;
    }
    // Real access tokens expire too, but the httpOnly refresh cookie
    // can mint a fresh one on demand — see `apiRequest`/`renewRealSession`.
    return { ...parsed, source };
  } catch {
    return null;
  }
}

export function writeSession(payload: LoginPayload & { source?: SessionSource }, remember: boolean): void {
  const stored: StoredSession = { ...payload, source: payload.source === 'api' ? 'api' : 'demo' };
  try {
    if (remember) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      window.localStorage.setItem(REMEMBER_KEY, '1');
      window.sessionStorage.removeItem(SESSION_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    /* storage blocked — the session still lives in React state */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Replace the stored session in the area it already lives in (token renewal). */
function persistStored(stored: StoredSession): void {
  try {
    if (currentArea() === 'local') window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } catch {
    /* storage blocked — the in-memory copy is still updated by callers */
  }
}

/** True when the current session belongs to the real HRM API. */
export function isApiSession(): boolean {
  return readSession()?.source === 'api';
}

/* ---------------- real HRM API plumbing ---------------- */

function parseTtl(value: unknown, fallbackMs: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value * 1000;
  const m = /^(\d+)\s*([smhd])?$/i.exec(String(value ?? '').trim());
  if (!m) return fallbackMs;
  const unit = (m[2] || 's').toLowerCase();
  const factor = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 1_000;
  return Number(m[1]) * factor;
}

/** Parse the safe error payload of a non-OK API response. */
async function errorFromResponse(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) message = body.error;
  } catch {
    /* non-JSON error body — keep the generic message */
  }
  return new ApiError(res.status, message);
}

/** One fetch against the real HRM API (same-origin, cookies included). */
async function realApi(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'The HR server is unreachable.');
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res;
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** The public reference (`SESS-…`) of the fresh token's login-session row. */
async function fetchSessionRef(accessToken: string): Promise<string> {
  try {
    const res = await fetch('/api/sessions/me', {
      credentials: 'same-origin',
      headers: bearer(accessToken),
    });
    if (!res.ok) return '';
    const body = (await res.json()) as { session?: { id?: string } | null };
    return body.session?.id ? String(body.session.id) : '';
  } catch {
    return '';
  }
}

interface ApiSessionRow {
  id: string;
  employeeId: string | null;
  role: SessionUser['role'];
  loginAt: string;
  logoutAt: string | null;
  status: 'Active' | 'LoggedOut';
  durationSeconds: number | null;
}

function mapApiSession(row: ApiSessionRow, self: SessionUser | null): LoginSessionRecord {
  return {
    id: String(row.id),
    userId: self?.id ?? '',
    employeeId: row.employeeId ?? null,
    name: self?.name ?? '',
    email: self?.email ?? '',
    role: row.role,
    loginAt: Date.parse(row.loginAt),
    logoutAt: row.logoutAt ? Date.parse(row.logoutAt) : null,
    durationMs: row.durationSeconds != null ? row.durationSeconds * 1000 : null,
    status: row.status === 'Active' ? 'Active' : 'Logged Out',
  };
}

/** Try the real API login. Returns null when the API is unreachable or
    the credentials are not a real account (the demo then answers). */
async function tryRealLogin(email: string, password: string): Promise<StoredSession | null> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return null; // API not running / offline → the demo answers instead
  }
  if (!res.ok) return null; // unknown account, wrong password, locked…
  try {
    const body = (await res.json()) as { accessToken?: string; expiresIn?: string; user?: SessionUser };
    if (!body.accessToken || !body.user) return null;
    const issuedAt = Date.now();
    return {
      accessToken: body.accessToken,
      sessionId: await fetchSessionRef(body.accessToken),
      user: body.user,
      issuedAt,
      expiresAt: issuedAt + parseTtl(body.expiresIn, 15 * 60 * 1000),
      source: 'api',
    };
  } catch {
    return null;
  }
}

let realSessionRenewal: Promise<StoredSession | null> | null = null;

/** Mint a fresh access token from the httpOnly refresh cookie. Persists
    the renewed session; returns null when the cookie is gone/expired.
    Concurrent 401 responses share one refresh because refresh tokens rotate
    on every use and replaying the old token revokes the whole token family. */
function renewRealSession(): Promise<StoredSession | null> {
  if (realSessionRenewal) return realSessionRenewal;

  realSessionRenewal = (async () => {
    let res: Response;
    try {
      // Use 'include' to ensure the httpOnly refresh cookie is sent even in
      // cross-origin scenarios (e.g., Vite dev proxy on different port).
      res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    try {
      const body = (await res.json()) as { accessToken?: string; expiresIn?: string; user?: SessionUser };
      if (!body.accessToken || !body.user) return null;
      const issuedAt = Date.now();
      const renewed: StoredSession = {
        accessToken: body.accessToken,
        sessionId: readSession()?.sessionId ?? '',
        user: body.user,
        issuedAt,
        expiresAt: issuedAt + parseTtl(body.expiresIn, 15 * 60 * 1000),
        source: 'api',
      };
      persistStored(renewed);
      return renewed;
    } catch {
      return null;
    }
  })().finally(() => {
    realSessionRenewal = null;
  });

  return realSessionRenewal;
}

/**
 * Authenticated request against the real HRM API for feature modules
 * (official payslips, documents …). Renews a lapsed access token once
 * via the httpOnly refresh cookie and throws `ApiError` carrying the
 * server's safe message on failure.
 */
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const session = readSession();
  if (!session || session.source !== 'api') {
    throw new ApiError(401, 'Sign in with your work account to open official documents.');
  }

  const attempt = async (token: string): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    let res: Response;
    try {
      res = await fetch(path, { credentials: 'same-origin', ...init, headers });
    } catch {
      throw new ApiError(0, 'The HR server is unreachable. Check that it is running and try again.');
    }
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  };

  try {
    return await attempt(session.accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    const latestSession = readSession();
    if (
      latestSession?.source === 'api' &&
      latestSession.accessToken !== session.accessToken
    ) {
      return attempt(latestSession.accessToken);
    }
    const renewed = await renewRealSession();
    if (!renewed) {
      clearSession();
      throw new ApiError(401, 'Your session has expired — please sign in again.');
    }
    return attempt(renewed.accessToken);
  }
}

export const api = {
  async login(email: string, password: string, remember: boolean): Promise<StoredSession> {
    const real = await tryRealLogin(email, password);
    if (!real) throw new ApiError(0, 'The HR server is unreachable. Please check your connection and try again.');
    writeSession(real, remember);
    return real;
  },

  async me(accessToken: string): Promise<SessionUser> {
    const stored = readSession();
    if (stored?.source === 'api') {
      const token = stored.accessToken || accessToken;
      try {
        const res = await realApi('/api/auth/me', { headers: bearer(token) });
        return ((await res.json()) as { user: SessionUser }).user;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
        const renewed = await renewRealSession();
        if (!renewed) {
          clearSession();
          throw new ApiError(401, 'Session expired — please sign in again.');
        }
        const res = await realApi('/api/auth/me', { headers: bearer(renewed.accessToken) });
        return ((await res.json()) as { user: SessionUser }).user;
      }
    }
    throw new ApiError(401, 'No valid session — please sign in again.');
  },

  /**
   * The caller's live login session (plus recent history and the
   * server clock) for the topbar session panel.
   */
  async sessionActivity(accessToken: string): Promise<SessionActivity> {
    const stored = readSession();
    if (!(stored?.source === 'api')) throw new ApiError(401, 'No valid session — please sign in again.');
    const token = stored.accessToken || accessToken;
    const [meRes, listRes, healthRes] = await Promise.all([
      realApi('/api/sessions/me', { headers: bearer(token) }),
      realApi('/api/sessions', { headers: bearer(token) }).catch(() => null),
      realApi('/api/health').catch(() => null),
    ]);
    const meBody = (await meRes.json()) as { session: ApiSessionRow | null };
    if (!meBody.session) throw new ApiError(404, 'Session record not found.');
    const listBody = listRes ? ((await listRes.json()) as { sessions?: ApiSessionRow[] }) : {};
    const health = healthRes ? ((await healthRes.json()) as { time?: string }) : null;
    const current = mapApiSession(meBody.session, stored.user);
    const recent = (listBody.sessions ?? []).slice(0, 5).map((r) => mapApiSession(r, stored.user));
    return {
      session: current,
      recent: recent.some((r) => r.id === current.id) ? recent : [current, ...recent].slice(0, 5),
      serverNow: health?.time ? Date.parse(health.time) : Date.now(),
    };
  },

  /**
   * Store one GPS capture (sign-in / check-in / check-out) on the
   * backend. Real sessions attach it to their active login-session
   * row; the demo stores the document as received.
   */
  async recordLocation(record: LocationRecord): Promise<LocationRecord> {
    const stored = readSession();
    if (!(stored?.source === 'api')) throw new ApiError(401, 'No valid session — please sign in again.');
    await apiRequest('/api/sessions/me/location', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: record.lat,
        longitude: record.lng,
        accuracy: record.accuracy,
      }),
    });
    return record;
  },

  /**
   * End the session. The backend closes the login-session row with
   * server time; the closed row is then read back so the UI can show
   * the recorded logout time and final duration.
   */
  async logout(accessToken: string): Promise<LoginSessionRecord | null> {
    const stored = readSession();
    if (!(stored?.source === 'api')) throw new ApiError(401, 'No valid session — please sign in again.');
    const token = stored.accessToken || accessToken;
    try {
      await realApi('/api/auth/logout', { method: 'POST', headers: bearer(token) });
    } catch {
      /* logout endpoint may already be invalidated; proceed to clear local state */
    }
    // The access token stays valid for its short lifetime, so the
    // now-closed row can be read back with server-computed duration.
    let closed: LoginSessionRecord | null = null;
    try {
      const res = await realApi('/api/sessions/me', { headers: bearer(token) });
      const body = (await res.json()) as { session: ApiSessionRow | null };
      if (body.session) closed = mapApiSession(body.session, stored.user);
    } catch {
      /* the confirmation row is optional */
    }
    clearSession();
    return closed;
  },
};
