/* ============================================================
   AttendanceGate — mandatory check-in gate.

   Shown after login (all roles) until the user has checked in
   for the day. Blocks the whole portal behind a modal.

   Location is captured only when the employee clicks Check In:
   a cached fix is used instantly when available, otherwise a single
   geolocation attempt with an 8-second timeout. Location is
   mandatory — the backend rejects check-in without it — so on
   denial/timeout we show a clear message and a Retry button; we
   never silently bypass location validation and never leave the
   button loading indefinitely.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { checkIn, attendanceErrorMessage } from '@/api/attendance';
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

  // Modal close handler — clicking (×), pressing Escape, or clicking the
  // backdrop does NOT perform check-in or create attendance records.
  // The mandatory check-in requirement remains enforced; the modal stays
  // displayed until the user completes check-in.
  const handleModalClose = () => {
    // no-op — does not call doCheckIn(), does not create records
  };

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
        const hint =
          res.reason === 'denied'
            ? 'Location permission was denied. Enable it in your browser (site settings → Location → Allow) and retry.'
            : res.reason === 'timeout'
              ? 'Location timed out. Make sure location is enabled and you have a clear view of the sky / Wi-Fi, then retry.'
              : 'Location is unavailable on this device.';
        setGeoDenied(true);
        setError(hint);
        toast(res.reason === 'denied' ? 'Location permission required' : 'Could not obtain location', 'error');
        return;
      }
      lat = res.point.lat;
      lng = res.point.lng;
      accuracy = res.point.accuracy;
    }

    try {
      await checkIn({
        consentGiven: true,
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
  }, [busy, browserTimezone, onCheckInComplete]);

  if (checkedInToday) {
    onCheckInComplete();
    return null;
  }

  return (
    <Modal
      title="Mandatory check-in"
      onClose={handleModalClose}
      large
      className="attendance-gate"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 460, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="userCheck" size={24} style={{ color: '#2563eb' }} />
          <h2 style={{ margin: 0, fontSize: 18 }}>Check in before using the portal</h2>
        </div>

        <div style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <p>
            Attendance is mandatory. Before you can access the HR portal you must
            check in today ({todayISO()}). We record:
          </p>
          <ul style={{ margin: 8, paddingLeft: 20, color: 'var(--text-2)' }}>
            <li>Check-in time (server clock) and your location at check-in</li>
            <li>Tab visibility / focus while the portal is open (active vs paused time)</li>
            <li>IP address and user agent</li>
          </ul>
          <p style={{ marginTop: 10 }}>
            Nothing is tracked in the background — only this tab’s visibility and
            location at check-in / check-out are recorded.
          </p>
        </div>

        {/* Consent */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 8 }}>
          <input
            id="att-consent"
            type="checkbox"
            defaultChecked
            readOnly
            style={{ accentColor: '#2563eb' }}
          />
          <label
            htmlFor="att-consent"
            style={{ fontSize: 13.5, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}
          >
            I consent to the above being recorded for today’s attendance.
          </label>
        </div>

        {(geoDenied || error) && (
          <div style={{ padding: 12, background: '#fef3f2', border: '1px solid #ef4444', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
            <Icon name="alertCircle" size={16} style={{ marginRight: 8 }} />
            {error || 'Location permission was denied or unavailable. Attendance is NOT marked.'}
            <button
              onClick={() => {
                setGeoDenied(false);
                setError('');
                setBusy(false);
                setLocating(false);
                void doCheckIn();
              }}
              className="btn btn-outline btn-sm"
              type="button"
              style={{ marginLeft: 10 }}
            >
              Retry
            </button>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={doCheckIn}
            disabled={busy}
            type="button"
          >
            {busy ? (locating ? 'Locating…' : 'Checking in…') : 'Check in now'}
          </button>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
          The portal stays blocked until check-in is complete. Location can be
          spoofed by a determined user — treat geolocation as a signal, not proof
          of presence.
        </p>
      </div>
    </Modal>
  );
}
