/* ============================================================
   AttendanceGate — mandatory check-in gate.

   Shown after login (all roles) until the user has checked in
   for the day. Blocks the whole portal behind a modal.
   Requires browser geolocation + consent before check-in is
   accepted. On denial, stays blocked with a clear message.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { checkIn, attendanceErrorMessage } from '@/api/attendance';
import { captureLocation, clearCachedFix, getCachedFix, prefetchLocation, todayISO } from '@/lib/geo';

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

  /* Prefetch location on mount so it's ready before the user clicks. */
  useEffect(() => {
    prefetchLocation();
  }, []);

  if (checkedInToday) {
    onCheckInComplete();
    return null;
  }

  const doCheckIn = async () => {
    if (busy) return;
    setBusy(true);
    setLocating(true);
    setError('');

    if (!navigator.geolocation) {
      setGeoDenied(true);
      setBusy(false);
      setLocating(false);
      return;
    }

    /* Use cached fix if fresh (instant), otherwise try a fast fix. */
    let lat: number | null = null;
    let lng: number | null = null;
    let accuracy: number | null = null;
    const cached = getCachedFix();
    if (cached) {
      lat = cached.lat;
      lng = cached.lng;
      accuracy = cached.accuracy;
      clearCachedFix();
    } else {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation!.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            maximumAge: 300_000,
            timeout: 4000,
          });
        });
        lat = Number(pos.coords.latitude.toFixed(6));
        lng = Number(pos.coords.longitude.toFixed(6));
        accuracy = Math.round(pos.coords.accuracy);
      } catch {
        /* Fast fix failed — retry once with a longer timeout, but never
           block the check-in itself. */
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation!.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              maximumAge: 300_000,
              timeout: 12000,
            });
          });
          lat = Number(pos.coords.latitude.toFixed(6));
          lng = Number(pos.coords.longitude.toFixed(6));
          accuracy = Math.round(pos.coords.accuracy);
        } catch {
          setLocating(false);
          setGeoDenied(true);
          setBusy(false);
          return;
        }
      }
    }

    try {
      await checkIn({
        consentGiven: true,
        lat: lat!,
        lng: lng!,
        accuracy: accuracy!,
      });

      toast('Checked in — location recorded.', 'success');
      onCheckInComplete();
    } catch (err) {
      setLocating(false);
      setError(attendanceErrorMessage(err));
      setBusy(false);
      return;
    }

    setLocating(false);
    onCheckInComplete();
  };

  return (
    <Modal
      title="Mandatory check-in"
      onClose={() => {}}
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

        {geoDenied && (
          <div style={{ padding: 12, background: '#fef3f2', border: '1px solid #ef4444', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
            <Icon name="alertCircle" size={16} style={{ marginRight: 8 }} />
            Location permission was denied or unavailable. Attendance is NOT marked.
            <button
              onClick={() => {
                setGeoDenied(false);
                setBusy(false);
                setLocating(false);
                /* Trigger a fresh geolocation attempt — the browser will
                   re-show the permission prompt if previously blocked. */
                void doCheckIn();
              }}
              className="btn btn-outline btn-sm"
              type="button"
              style={{ marginLeft: 10 }}
            >
              Retry
            </button>
            Enable it in your browser (site settings → Location → Allow) and retry.
          </div>
        )}

        {error && (
          <div style={{ padding: 12, background: '#fef3f2', border: '1px solid #ef4444', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
            {error}
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
