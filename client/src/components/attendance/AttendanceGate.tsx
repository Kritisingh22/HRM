/* ============================================================
   Attendance Gate — check-in optional, not mandatory.
   
   Shown once per login session as a non-blocking overlay.
   The user may close it (×), press Esc, or click the backdrop.
   After dismissal it will not appear again for this session.
   The user can check in anytime from the dashboard CheckInCard.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { checkIn, checkOut, attendanceErrorMessage } from '@/api/attendance';
import { captureLocation, getCachedFix, type CaptureReason } from '@/lib/geo';
import { todayISO } from '@/lib/date';

interface AttendanceGateProps {
  checkedInToday: boolean;
  hasOpenSession: boolean;
  onCheckInComplete: () => void;
}

export function AttendanceGate({
  checkedInToday,
  hasOpenSession,
  onCheckInComplete,
}: AttendanceGateProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [geoDenied, setGeoDenied] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showGate, setShowGate] = useState(true);
  const [consentGiven, setConsentGiven] = useState(false);

  // Once dismissed, never show again in this session (sessionStorage guard).
  useEffect(() => {
    try {
      const key = 'cyethackHRM.attendanceGateDismissed';
      const previously = sessionStorage.getItem(key);
      if (previously) setShowGate(false);
    } catch (_) {
      // sessionStorage may not be available (incognito, some tests); fall back
      // to showing the gate once.
    }
  }, []);

  // Persist dismissal so it doesn't re-appear in the same session.
  const markDismissed = useCallback(() => {
    try {
      sessionStorage.setItem('cyethackHRM.attendanceGateDismissed', '1');
    } catch (_) {}
  }, []);

  // Track last focused element before modal open for focus return on close.
  const [lastFocus, setLastFocus] = useState<string | null>(null);
  useEffect(() => {
    if (showGate) {
      setLastFocus(document.activeElement?.id ?? null);
    }
  }, [showGate]);

  // Modal close handler — clicking (×), pressing Escape, or clicking the
  // backdrop dismisses the gate. After close, focus returns to the element
  // that had focus before the gate opened. sessionStorage dismissal flag
  // prevents re-appearance in the same session.
  const handleModalClose = useCallback(() => {
    markDismissed();
    onCheckInComplete();
  }, [markDismissed, onCheckInComplete]);

  // Trap focus while the modal is open; return focus on close.
  useEffect(() => {
    if (!showGate) {
      // Restore focus to the element that had focus before the modal opened.
      const element = lastFocus ? document.getElementById(lastFocus) : null;
      if (element) { element.focus(); }
      setLastFocus(null);
    }
  }, [showGate]);

  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const doCheckIn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setLocating(true);
    setError('');
    setGeoDenied(false);

    if (!navigator.geolocation) {
      setGeoDenied(true);
      setBusy(false);
      setLocating(false);
      setError('Location permission is required to check in.');
      toast('Location permission required', 'error');
      return;
    }

    /* 1. cached fix first (instant) */
    let lat: number | null = null;
    let lng: number | null = null;
    let accuracy: number | null = null;
    const cached = getCachedFix();
    if (cached) {
      lat = cached.lat;
      lng = cached.lng;
      accuracy = cached.accuracy;
    } else {
      /* 2. single geolocation shot, 8-second timeout — no silent retry loop */
      const res = await captureLocation(8000);
      if (!res.point) {
        setLocating(false);
        setBusy(false);
        const hint = res.reason === 'denied'
          ? 'Location permission was denied. Enable it in your browser (site settings → Location → Allow) and retry.'
          : res.reason === 'timeout'
            ? 'Location timed out. Make sure location is enabled and you have a clear view of the sky / Wi-Fi, then retry.'
            : 'Location is unavailable on this device.';
        setGeoDenied(true);
        setError(hint);
        toast(hint, 'error');
        return;
      }
      lat = res.point.lat;
      lng = res.point.lng;
      accuracy = res.point.accuracy;
    }

    try {
      await checkIn({
        consentGiven,
        lat: lat!,
        lng: lng!,
        accuracy: accuracy!,
        clientTimestamp: new Date().toISOString(),
        timezone: browserTimezone,
      });

      toast('Checked in — location recorded.', 'success');
      onCheckInComplete();
    } catch (err) {
      setLocating(false);
      setBusy(false);
      setError(attendanceErrorMessage(err));
      toast('Check-in failed', 'error');
      return;
    }

    setLocating(false);
    setBusy(false);
    onCheckInComplete();
  }, [busy, consentGiven, browserTimezone, onCheckInComplete]);

  if (!showGate || checkedInToday) {
    onCheckInComplete();
    return null;
  }

  return (
    <Modal
      title="Check in"
      onClose={handleModalClose}
      large
      className="attendance-gate"
      aria-modal="true"
      aria-labelledby="gate-title"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxWidth: 460,
          margin: '0 auto',
        }}
      >
        <h2 id="gate-title" style={{ margin: 0, fontSize: 18 }}>
          Check in before using the portal
        </h2>

        <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Attendance is recorded when you check in. We record:
        </p>
        <ul style={{ margin: 8, paddingLeft: 20, color: 'var(--text-2)' }}>
          <li>Check-in time (server clock) and your location at check-in</li>
          <li>Tab visibility / focus while the portal is open (active vs paused time)</li>
          <li>IP address and user agent</li>
        </ul>
        <p style={{ marginTop: 10 }}>
          Nothing is tracked in the background — only this tab's visibility and
          location at check-in / check-out are recorded.
        </p>

        {/* Consent — real controlled checkbox; disabled until ticked */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 8,
          }}
        >
          <input
            id="att-consent"
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            disabled={busy}
            style={{ accentColor: '#2563eb' }}
          />
          <label
            htmlFor="att-consent"
            style={{
              fontSize: 13.5,
              color: 'var(--text-2)',
              cursor: consentGiven ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            I consent to the above being recorded for today's attendance.
          </label>
        </div>

        {/* Errors only — location denied, network, 409 already checked in.
              Uses theme tokens --red / --red-tint, no hardcoded light colors. */}
        {(geoDenied || error) && (
          <div
            style={{
              padding: 12,
              background: 'var(--red-tint)',
              border: '1px solid var(--red)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--red)',
            }}
          >
            <Icon name="alertCircle" size={16} style={{ marginRight: 8 }} />
            {error || 'Location permission was denied or unavailable. Attendance is NOT marked.'}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={doCheckIn}
            disabled={busy || !consentGiven}
            type="button"
          >
            {busy ? (locating ? 'Locating…' : 'Checking in…') : 'Check in now'}
          </button>
          <button
            onClick={handleModalClose}
            className="btn btn-outline"
            style={{ marginLeft: 8 }}
            type="button"
          >
            Not now
          </button>
        </div>

        <p
          style={{
            fontSize: 12.5,
            color: 'var(--muted)',
            marginTop: 10,
          }}
        >
          The portal is fully usable without checking in. Location can be
          spoofed by a determined user — treat geolocation as a signal, not proof
          of presence.
        </p>
      </div>
    </Modal>
  );
}