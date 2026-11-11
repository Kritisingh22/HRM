/* ============================================================
   Check-in card — the signed-in person's attendance for today.

   Demo sessions: write an explicit attendance override
   (`employeeId|today`) which the derived register reads, and capture
   a one-shot GPS fix. Location is optional there — a refusal never
   blocks the action.

   Real (API) sessions: the server mints the timestamps and persists
   to MongoDB. Location + consent are mandatory and are captured only
   when the employee clicks Check In / Check Out — never in the
   background. The UI does not show success until the backend
   confirms the write, then refreshes today's attendance state so
   the check-in/check-out is visible immediately (and survives a
   refresh).
   ============================================================ */
import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { isApiSession } from '@/api/client';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  checkIn as checkInApi,
  checkOut as checkOutApi,
  attendanceErrorMessage,
  getMe,
} from '@/api/attendance';
import {
  accuracyText,
  captureLocation,
  coordText,
  GEO_KIND_LABELS,
  getCachedFix,
  mapsUrl,
  type CaptureReason,
} from '@/lib/geo';
import { clockNow, DAYS_LONG, isWeekendISO, niceDate, parseISO, todayISO, durationFromMs } from '@/lib/date';
import { durationText, overrideKey, parseClockMinutes, requestOn } from '@/lib/attendance';
import type { AttendanceRecord, AttendanceRow, GeoPoint } from '@/types';

export function CheckInCard() {
  const { data, dispatch, audit, logLocation } = useApp();
  const { user, fetchAttendanceState } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [note, setNote] = useState('');
  const [locating, setLocating] = useState(false);
  const [todayRow, setTodayRow] = useState<AttendanceRow | null>(null);

  const api = isApiSession();
  const empId = user?.employeeId ?? null;
  const today = todayISO();
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /* Real sessions: read today's server record so the UI reflects
     persisted truth (including after a reload). */
  useEffect(() => {
    if (!api) return;
    void getMe()
      .then((res) => setTodayRow(res.todayRow ?? null))
      .catch(() => {
        /* best-effort; the gate / next render will recover */
      });
  }, [api]);

  /* Nothing to check into on weekends or holidays. */
  if (!empId || !user) return null;
  if (isWeekendISO(today) || data.holidays.some((h) => h.date === today)) return null;

  const key = overrideKey(empId, today);
  const record: AttendanceRow | AttendanceRecord | null = api ? todayRow : data.attendanceOverrides[key];
  const geoLines = data.locationLog.filter((l) => l.ref === key && l.kind !== 'login');

  const leave = requestOn(data.leaveRequests, empId, today);
  const approvedLeave = leave?.status === 'Approved' ? leave : null;
  const wfh = approvedLeave?.type === 'Work From Home';
  const onLeave = Boolean(approvedLeave && !wfh);

  const checkedIn = Boolean(record?.checkIn);
  const checkedOut = Boolean(record?.checkOut);
  const worked =
    record?.workingHoursMinutes != null
      ? durationFromMs(record.workingHoursMinutes * 60_000)
      : record?.workingHours;

  const inRange = record?.geofence?.inRange;
  const locationVerified = record?.location?.verificationStatus === 'verified';

  /* Store where permitted; explain politely when not. */
  const noteFor = (reason: CaptureReason) => {
    if (reason === 'denied') {
      setNote("Location wasn't shared — allow it in your browser to record where you check in next time.");
    } else if (reason !== 'ok') {
      setNote("Couldn't determine a location this time.");
    }
  };

  /* ---- check-in ----------------------------------------------------- */
  const handleCheckIn = useCallback(async () => {
    if (busy || onLeave) return;
    setBusy('in');
    setLocating(true);
    setNote('');

    /* 1. cached fix first (instant); otherwise one fast geolocation shot. */
    let point: GeoPoint | null = getCachedFix();
    let reason: CaptureReason = 'ok';
    if (!point) {
      const res = await captureLocation(8000);
      point = res.point;
      reason = res.reason;
    }

    /* Location is mandatory for real sessions — never bypass or fake it. */
    if (!point) {
      setLocating(false);
      setBusy(null);
      setNote("Location is required for check-in. Allow geolocation in your browser and retry.");
      toast('Location required for check-in', 'error');
      return;
    }

    if (!api) {
      /* ---- demo path: local override only --------------------------- */
      const time = clockNow();
      const mins = parseClockMinutes(time);
      const rec: AttendanceRecord = {
        ...(record ?? {}),
        status: record?.status ?? (wfh ? 'wfh' : 'present'),
        checkIn: time,
      };
      if (mins !== null && mins > 570) rec.lateBy = `${mins - 570} min`;
      dispatch({ type: 'override', key, record: rec });
      if (point) {
        logLocation({ kind: 'check-in', ref: key, employeeId: empId, email: user.email, ...point });
      }
      audit('Attendance check-in', `${today} · ${time}`, user.name);
      setLocating(false);
      toast(point ? `Checked in at ${time} — location recorded.` : `Checked in at ${time}.`, 'success');
      noteFor(reason);
      setBusy(null);
      return;
    }

    /* ---- real path: server confirms before we show success ---------- */
    try {
      const { attendance } = await checkInApi({
        consentGiven: true,
        lat: point.lat,
        lng: point.lng,
        accuracy: point.accuracy,
        clientTimestamp: point.capturedAt,
        timezone: browserTimezone,
      });
      const row = attendance as AttendanceRow;
      setTodayRow(row);
      await fetchAttendanceState(); // refresh checkedInToday / hasOpenSession (dismisses the gate)

      if (point) {
        logLocation({ kind: 'check-in', ref: key, employeeId: empId, email: user.email, ...point });
      }
      audit('Attendance check-in', `${today} · ${row.checkIn}`, user.name);

      const verified = inRange !== undefined ? inRange : locationVerified;
      toast(
        `Checked in at ${row.checkIn} — ${verified ? 'Location verified' : 'Location recorded'}`,
        'success',
      );
    } catch (err) {
      const msg = attendanceErrorMessage(err);
      setNote(msg);
      toast(msg, 'error');
    } finally {
      setLocating(false);
      setBusy(null);
    }
  }, [api, busy, onLeave, key, empId, user, today, browserTimezone, record, inRange, locationVerified, fetchAttendanceState]);

  /* ---- check-out ---------------------------------------------------- */
  const handleCheckOut = useCallback(async () => {
    if (busy || !checkedIn) return;
    setBusy('out');
    setLocating(true);
    setNote('');

    /* Check-out location is optional on the server; send it when we have it. */
    let point: GeoPoint | null = getCachedFix();
    let reason: CaptureReason = 'ok';
    if (!point) {
      const res = await captureLocation(8000);
      point = res.point;
      reason = res.reason;
    }

    if (!api) {
      /* ---- demo path: local override only --------------------------- */
      const time = clockNow();
      const rec: AttendanceRecord = { ...(record as AttendanceRecord), checkOut: time };
      const workedDemo = durationText(record?.checkIn ?? '', time);
      if (workedDemo) rec.workingHours = workedDemo;
      dispatch({ type: 'override', key, record: rec });
      if (point) {
        logLocation({ kind: 'check-out', ref: key, employeeId: empId, email: user.email, ...point });
      }
      audit('Attendance check-out', `${today} · ${time}`, user.name);
      setLocating(false);
      toast(
        point ? `Checked out at ${time} — location recorded.` : `Checked out at ${time}.`,
        'success',
      );
      noteFor(reason);
      setBusy(null);
      return;
    }

    /* ---- real path: server confirms before we show success ---------- */
    try {
      const payload: Record<string, unknown> = {};
      if (point) {
        payload.lat = point.lat;
        payload.lng = point.lng;
        payload.accuracy = point.accuracy;
        payload.clientTimestamp = point.capturedAt;
        payload.timezone = browserTimezone;
      }
      const { attendance } = await checkOutApi(payload);
      const row = attendance as AttendanceRow;
      setTodayRow(row);
      await fetchAttendanceState();

      if (point) {
        logLocation({ kind: 'check-out', ref: key, employeeId: empId, email: user.email, ...point });
      }
      audit('Attendance check-out', `${today} · ${row.checkOut}`, user.name);

      const workedServer =
        row.workingHoursMinutes != null ? durationFromMs(row.workingHoursMinutes * 60_000) : null;
      toast(
        `Checked out at ${row.checkOut} — worked ${workedServer ?? '—'}`,
        'success',
      );
    } catch (err) {
      const msg = attendanceErrorMessage(err);
      setNote(msg);
      toast(msg, 'error');
    } finally {
      setLocating(false);
      setBusy(null);
    }
  }, [api, busy, checkedIn, key, empId, user, today, browserTimezone, record, fetchAttendanceState]);

  const checkInTime = record?.checkIn ?? '';
  const checkOutTime = record?.checkOut ?? '';
  const lateBy = record?.lateBy ?? '';
  const stateText = !checkInTime
    ? 'Not checked in yet'
    : checkOutTime
      ? `Checked in ${checkInTime} · checked out ${checkOutTime}`
      : `Checked in at ${checkInTime}${lateBy ? ` · late by ${lateBy}` : ''}`;

  return (
    <section className="card span12">
      <div className="card-head">
        <div>
          <h2>
            Today · {DAYS_LONG[parseISO(today).getDay()]}, {niceDate(today)}
          </h2>
          <div className="sub">
            {api
              ? 'Check-in and check-out times are recorded by the HR server — no background tracking'
              : 'Location is captured once per action, only with your permission — never tracked in the background'}
          </div>
        </div>
        <div className="act-btns">
          {onLeave ? (
            <span className="chip">On approved leave {approvedLeave ? `· ${approvedLeave.type}` : ''}</span>
          ) : null}
          {wfh ? <span className="chip">Work From Home approved</span> : null}
          {worked ? <span className="chip">Worked {worked}</span> : null}
          {!onLeave && !checkedIn ? (
            <button className="btn btn-primary btn-sm" onClick={handleCheckIn} disabled={busy !== null} type="button">
              <Icon name="navigation" size={15} />
              {busy === 'in' ? (locating ? 'Locating…' : 'Checking in…') : 'Check in'}
            </button>
          ) : null}
          {!onLeave && checkedIn && !checkedOut ? (
            <button className="btn btn-primary btn-sm" onClick={handleCheckOut} disabled={busy !== null} type="button">
              <Icon name="clock" size={15} />
              {busy === 'out' ? (locating ? 'Locating…' : 'Checking out…') : 'Check out'}
            </button>
          ) : null}
          {checkedIn && !checkedOut && locationVerified !== undefined && !locationVerified ? (
            <span className="chip" style={{ color: '#b91c1c' }}>
              Location outside office radius
            </span>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="num" style={{ fontSize: 13 }}>
          {stateText}
        </span>
      </div>

      {geoLines.length ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {geoLines.map((line) => (
            <span
              key={line.id}
              style={{
                fontSize: 12.5,
                color: 'var(--text-2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="mapPin" size={13} />
              {GEO_KIND_LABELS[line.kind]} recorded at {coordText(line)} ({accuracyText(line)}) ·{' '}
              <a className="link" href={mapsUrl(line)} target="_blank" rel="noreferrer">
                View on map
              </a>
            </span>
          ))}
        </div>
      ) : null}

      {note ? (
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-2)' }}>{note}</div>
      ) : null}
    </section>
  );
}
