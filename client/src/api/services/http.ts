/* ============================================================
   HTTP helpers for the feature services.

   One authenticated entry point (`apiRequest` from api/client.ts)
   already handles the bearer token, silent refresh, and throwing
   `ApiError` with the server's safe message. These helpers add
   JSON parsing and the common verbs, so no feature module ever
   hand-rolls headers, base URLs or error mapping.
   ============================================================ */
import { apiRequest } from '@/api/client';
import { ApiError } from '@/api/mockServer';

export { ApiError };

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiRequest(path, init);
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiJson<T>(path);
}

export function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return apiJson<T>(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** The server's safe message for any failure (network errors included). */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || `The server rejected the request (${err.status}).`;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong while talking to the HR server.';
}

/**
 * POST/PUT a file as multipart/form-data (no JSON content-type header —
 * the browser adds the boundary itself).
 */
export async function apiUpload<T>(
  method: 'POST' | 'PUT',
  path: string,
  form: FormData,
): Promise<T> {
  const res = await apiRequest(path, { method, body: form });
  return (await res.json()) as T;
}

/**
 * Fetch an endpoint a role may legitimately not be allowed to read
 * (403) or that may be absent (404). Returns null instead of throwing;
 * genuine failures (401/5xx/network) still throw.
 */
export async function apiGetOptional<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return null;
    throw err;
  }
}
