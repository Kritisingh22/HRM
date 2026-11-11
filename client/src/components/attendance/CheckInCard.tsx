/* ============================================================
   Check-in card — the signed-in person's attendance for today.

   Checking in / out writes an explicit attendance override for
   `employeeId|today` (which the derived register then reads) and
   captures a one-shot GPS fix. The fix is stored in `locationLog`
   only when the browser allows location — a refusal never blocks
   the action, it just skips the record. No background tracking.
   ============================================================ */
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { isApiSession } from '@/api/client';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { durationText, overrideKey, parseClockMinutes, requestOn } from '@/lib/attendance';
import { clockNow, DAYS_LONG, isWeekendISO, niceDate, parseISO, todayISO } from '@/lib/date';
import {
  accuracyText,
  captureLocation,
  clearCachedFix,
  coordText,
  GEO_KIND_LABELS,
  getCachedFix,
  mapsUrl,
  prefetchLocation,
  type CaptureReason,
} from '@/lib/geo';
import type { AttendanceRecord, GeoPoint } from '@/types';

export function CheckInCard() {
  const { data, dispatch, audit, logLocation } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [note, setNote] = useState('');
  const [locating, setLocating] = useState(false);

  const empId = user?.employeeId ?? null;
  const today = todayISO();
  /* Real sessions: the server mints the timestamps and stores no
     per-action GPS — so no location prompt is raised here. */
  const api = isApiSession();

  /* Prefetch a location fix on mount so it's ready before the user clicks. */
  useEffect(() => {
    if (!api) prefetchLocation();
    return () => { /* no cleanup needed */ };
  }, [api]);

  /* Nothing to check into on weekends or holidays. */
  if (!empId || !user) return null;
  if (isWeekendISO(today) || data.holidays.some((h) => h.date === today)) return null;

  const key = overrideKey(empId, today);
  const record = data.attendanceOverrides[key];
  const geoLines = data.locationLog.filter((l) => l.ref === key && l.kind !== 'login');

  const leave = requestOn(data.leaveRequests, empId, today);
  const approvedLeave = leave?.status === 'Approved' ? leave : null;
  const wfh = approvedLeave?.type === 'Work From Home';
  const onLeave = Boolean(approvedLeave && !wfh);

  /* Store where permitted; explain politely when not. */
  const noteFor = (reason: CaptureReason) => {
    if (reason === 'denied') {
      setNote("Location wasn't shared — allow it in your browser to record where you check in next time.");
    } else if (reason !== 'ok') {
      setNote("Couldn't determine a location this time — the action was still recorded.");
    }
  };

  const checkIn = async () => {
    if (busy || onLeave) return;
    setBusy('in');
    setLocating(true);
    setNote('');
    let point: GeoPoint | null = null;
    let reason: CaptureReason = 'ok';
    if (!api) {
      /* Use cached fix if fresh (instant), otherwise try a fast fix. */
      point = getCachedFix();
      if (!point) {
        try {
          const res = await captureLocation(4000);
          point = res.point;
          reason = res.reason;
        } catch {
          reason = 'unavailable';
        }
        /* If the fast fix failed, retry once with a longer timeout —
           but never block the check-in itself. */
        if (!point) {
          try {
            const res = await captureLocation(12000);
            point = res.point;
            reason = res.reason;
          } catch {
            reason = 'unavailable';
          }
        }
      } else {
        clearCachedFix();
      }
    }
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
    toast(
      api
        ? 'Checked in — the server recorded your time.'
        : point
          ? `Checked in at ${time} — location recorded.`
          : `Checked in at ${time}.`,
      'success',
    );
    noteFor(reason);
    setBusy(null);
  };

  const checkOut = async () => {
    if (busy || !record?.checkIn) return;
    setBusy('out');
    setLocating(true);
    setNote('');
    let point: GeoPoint | null = null;
    let reason: CaptureReason = 'ok';
    if (!api) {
      point = getCachedFix();
      if (!point) {
        try {
          const res = await captureLocation(4000);
          point = res.point;
          reason = res.reason;
        } catch {
          reason = 'unavailable';
        }
        if (!point) {
          try {
            const res = await captureLocation(12000);
            point = res.point;
            reason = res.reason;
          } catch {
            reason = 'unavailable';
          }
        }
      } else {
        clearCachedFix();
      }
    }
    const time = clockNow();
    const rec: AttendanceRecord = { ...record, checkOut: time };
    const worked = durationText(record.checkIn, time);
    if (worked) rec.workingHours = worked;
    dispatch({ type: 'override', key, record: rec });
    if (point) {
      logLocation({ kind: 'check-out', ref: key, employeeId: empId, email: user.email, ...point });
    }
    audit('Attendance check-out', `${today} · ${time}`, user.name);
    setLocating(false);
    toast(
      api
        ? 'Checked out — the server recorded your time.'
        : point
          ? `Checked out at ${time} — location recorded.`
          : `Checked out at ${time}.`,
      'success',
    );
    noteFor(reason);
    setBusy(null);
  };

  const stateText = !record?.checkIn
    ? 'Not checked in yet'
    : record.checkOut
      ? `Checked in ${record.checkIn} · checked out ${record.checkOut}`
      : `Checked in at ${record.checkIn}${record.lateBy ? ` · late by ${record.lateBy}` : ''}`;

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
          {record?.workingHours ? <span className="chip">Worked {record.workingHours}</span> : null}
          {!onLeave && !record?.checkIn ? (
            <button className="btn btn-primary btn-sm" onClick={checkIn} disabled={busy !== null} type="button">
              <Icon name="navigation" size={15} />
              {busy === 'in' ? 'Checking in…' : 'Check in'}
            </button>
          ) : null}
          {!onLeave && record?.checkIn && !record.checkOut ? (
            <button className="btn btn-primary btn-sm" onClick={checkOut} disabled={busy !== null} type="button">
              <Icon name="clock" size={15} />
              {busy === 'out' ? 'Checking out…' : 'Check out'}
            </button>
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
