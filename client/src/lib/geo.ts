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
export function captureLocation(timeoutMs = 9000): Promise<CaptureResult> {
  if (!geoSupported()) {
    return Promise.resolve({ point: null, reason: 'unsupported' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          reason: 'ok',
          point: {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
            capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
          },
        }),
      (err) => {
        const reason: CaptureReason =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        resolve({ point: null, reason });
      },
      /* A minute-old fix is fine for "where did this action happen". */
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs },
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
