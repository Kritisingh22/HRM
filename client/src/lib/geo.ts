/* ============================================================
   Geolocation — one-shot capture for login & attendance actions.

   Privacy stance:
   • the portal never calls `watchPosition` and never tracks in
     the background;
   • a fix is requested only when the user performs an action —
     sign-in, check-in or check-out;
   • denial, timeout or an unsupported browser resolves to `null`
     and the action still completes, just without a location.

   In production the result is the payload a real backend would
   persist per event: latitude, longitude, accuracy, captured-at
   timestamp and the action reference (see README).
   ============================================================ */
import type { GeoActivityKind, GeoPoint } from '@/types';
import { niceDate } from '@/lib/date';

export type CaptureReason = 'ok' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface CaptureResult {
  point: GeoPoint | null;
  reason: CaptureReason;
}

export function geoSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Ask the browser for a single position fix. The permission prompt
 * (when the browser shows one) is triggered by this call, which is
 * only ever made from a user action.
 */
/* ============================================================
   Geolocation — one-shot capture for login & attendance actions.

   Privacy stance:
   • the portal never calls `watchPosition` and never tracks in
     the background;
   • a fix is requested only when the user performs an action —
     sign-in, check-in or check-out;
   • denial, timeout or an unsupported browser resolves to `null`
     and the action still completes, just without a location.

   In production the result is the payload a real backend would
   persist per event: latitude, longitude, accuracy, captured-at
   timestamp and the action reference (see README).
   ============================================================ */
import type { GeoActivityKind, GeoPoint } from '@/types';
import { niceDate } from '@/lib/date';

export type CaptureReason = 'ok' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface CaptureResult {
  point: GeoPoint | null;
  reason: CaptureReason;
}

export function geoSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/* ---- cached location for instant check-in ---- */

/** Last successful fix, reused so check-in can fire immediately on click. */
let cachedFix: { point: GeoPoint; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Return a cached fix if fresh, else null. */
export function getCachedFix(): GeoPoint | null {
  if (!cachedFix || Date.now() - cachedFix.fetchedAt > CACHE_TTL_MS) return null;
  return cachedFix.point;
}

/** Clear the cached fix (e.g. after a denied/failed attempt). */
export function clearCachedFix(): void {
  cachedFix = null;
}

/** Prefetch a location fix in the background so it's ready before the user
   clicks Check In. Safe to call on mount; failures are silent. */
export function prefetchLocation(): void {
  if (!geoSupported()) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      cachedFix = {
        point: {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        },
        fetchedAt: Date.now(),
      };
    },
    () => {
      /* silent — we'll try again on click */
    },
    { enableHighAccuracy: false, maximumAge: 300_000, timeout: 4000 },
  );
}

/**
 * Ask the browser for a single position fix. The permission prompt
 * (when the browser shows one) is triggered by this call, which is
 * only ever made from a user action.
 *
 * Defaults are tuned for speed: low accuracy, a short timeout, and a
 * 5-minute maximum cache age so a recent fix can be reused instantly.
 */
export function captureLocation(timeoutMs = 4000): Promise<CaptureResult> {
  const t0 = Date.now();
  if (!geoSupported()) {
    GEO_TIMING('unsupported', t0);
    return Promise.resolve({ point: null, reason: 'unsupported' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        GEO_TIMING('position-fix', t0);
        cachedFix = {
          point: {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
            capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
          },
          fetchedAt: Date.now(),
        };
        resolve({
          reason: 'ok',
          point: cachedFix.point,
        });
      },
      (err) => {
        GEO_TIMING('position-error', t0);
        const reason: CaptureReason =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        resolve({ point: null, reason });
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: timeoutMs },
    );
  });
}

/* ---------------- display helpers ---------------- */

export const GEO_KIND_LABELS: Record<GeoActivityKind, string> = {
  login: 'Sign-in',
  'check-in': 'Check-in',
  'check-out': 'Check-out',
};

export function coordText(point: GeoPoint): string {
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

export function accuracyText(point: GeoPoint): string {
  return `±${point.accuracy} m`;
}

export function mapsUrl(point: GeoPoint): string {
  return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
}

/** `16 Oct 2026 · 09:05 am` for a captured-at timestamp. */
export function capturedText(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${niceDate(isoTimestamp.slice(0, 10))} · ${time}`;
}
