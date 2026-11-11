/* ============================================================
   Attendance API — mandatory check-in, geofence, active-time
   heartbeats, and HR settings.

   All calls require an API session (Bearer token). The server
   re-checks every permission and object-level scope.
   ============================================================ */
import { apiGet, apiSend, apiUpload, apiErrorMessage } from '@/api/services/http';
import type {
  AttendanceCheckInPayload,
  AttendanceSettings,
  AttendanceRow,
  AttendanceHeartbeatResponse,
} from '@/types';

const BASE = '/api/attendance';

/** Check in (mandatory): consent + geolocation required. */
export async function checkIn(payload: AttendanceCheckInPayload): Promise<{ attendance: AttendanceRow; settings: AttendanceSettings | null }> {
  const t0 = Date.now();
  const res = await apiSend('POST', `${BASE}/check-in`, payload);
  /* TEMP TIMING — remove after measurement */
  console.log(`[TIMING][http] POST /api/attendance/check-in: ${Date.now() - t0}ms`);
  return res as never;
}

/** Send a heartbeat (active / paused). Returns computed totals. */
export async function heartbeat(state: 'active' | 'paused', reason?: string): Promise<AttendanceHeartbeatResponse> {
  const res = await apiSend('POST', `${BASE}/heartbeat`, { state, reason });
  return res as never;
}

/** Explicit pause (blur / idle / tab switch). */
export async function pause(reason?: string): Promise<{ attendance: AttendanceRow; activeSeconds: number; pausedSeconds: number }> {
  const res = await apiSend('POST', `${BASE}/pause`, { reason });
  return res as never;
}

/** Check out (optional geolocation). */
export async function checkOut(payload?: { lat?: number; lng?: number; accuracy?: number }): Promise<{ attendance: AttendanceRow; activeSeconds: number; pausedSeconds: number; status: AttendanceRow['status'] }> {
  const res = await apiSend('POST', `${BASE}/check-out`, payload ?? {});
  return res as never;
}

/** My attendance rows for a month/range (+ active session state). */
export async function getMe(params?: { from?: string; to?: string; month?: string }): Promise<{
  employeeId: string | null;
  from: string;
  to: string;
  attendance: AttendanceRow[];
  settings: AttendanceSettings | null;
  todayRow: AttendanceRow | null;
  hasOpenSession: boolean;
  checkedInToday: boolean;
}> {
  const qs = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : '';
  const res = await apiGet(`${BASE}/me${qs}`);
  return res as never;
}

/** Scoped attendance list (HR/Manager: team; Employee: self). */
export async function listAttendance(params?: {
  employee?: string;
  from?: string;
  to?: string;
  date?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  count: number;
  total: number;
  page: number;
  pages: number;
  attendance: AttendanceRow[];
}> {
  const qs = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : '';
  const res = await apiGet(`${BASE}${qs}`);
  return res as never;
}

/** Read geofence/session settings (HR/Manager). */
export async function getAttendanceSettings(): Promise<{ settings: AttendanceSettings | null }> {
  const res = await apiGet(`${BASE}/settings`);
  return res as never;
}

/** Update geofence/session settings (HR only). */
export async function updateAttendanceSettings(body: Partial<AttendanceSettings>): Promise<{ settings: AttendanceSettings }> {
  const res = await apiSend('POST', `${BASE}/settings`, body);
  return res as never;
}

/** Human-readable error message for an attendance API error. */
export function attendanceErrorMessage(err: unknown): string {
  return apiErrorMessage(err);
}
