/* ============================================================
   Day details — the modal behind every calendar cell.

   Explains the day's policy state (weekend / holiday), the
   signed-in person's attendance (self scope only) and lists the
   leave requests covering the date; each row opens its own
   request dialog. Nothing here is invented — the list is the
   caller's scoped, filtered record set.
   ============================================================ */
import { Modal } from '@/components/ui/Modal';
import { DetailList } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import {
  ATTENDANCE_META,
  attendanceOn,
  holidayOn,
  overrideKey,
  requestOn,
} from '@/lib/attendance';
import { accuracyText, coordText, mapsUrl } from '@/lib/geo';
import { DAYS_LONG, dateRange, isWeekendISO, niceDate, parseISO, todayISO } from '@/lib/date';
import type { GeoPoint, LeaveRequest } from '@/types';

interface DayDetailsModalProps {
  iso: string;
  onClose: () => void;
  onApply: (iso: string) => void;
  /** scoped, filter-applied requests covering this date (defaults to the signed-in person's) */
  events?: LeaveRequest[];
  /** false while browsing a team / company scope — hides personal attendance */
  showSelfAttendance?: boolean;
  /** open one covering request in its own dialog */
  onOpenRequest?: (request: LeaveRequest) => void;
}

export function DayDetailsModal({
  iso,
  onClose,
  onApply,
  events,
  showSelfAttendance = true,
  onOpenRequest,
}: DayDetailsModalProps) {
  const { data } = useApp();
  const { user } = useAuth();
  const myId = user?.employeeId ?? '';
  const today = todayISO();

  const ctx = { holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides };
  const weekend = isWeekendISO(iso);
  const holiday = holidayOn(data.holidays, iso);
  const att = showSelfAttendance && myId ? attendanceOn(myId, iso, ctx) : null;
  const future = iso > today;

  /* The day's requests: the caller's scoped + filtered list, or the
     signed-in person's own request when used standalone. */
  const dayEvents =
    events ??
    (myId ? [requestOn(data.leaveRequests, myId, iso)].filter((r): r is LeaveRequest => r !== null) : []);

  /* GPS captures recorded against this specific day (check-in/out only). */
  const dayLogs =
    showSelfAttendance && myId
      ? data.locationLog.filter((l) => l.ref === overrideKey(myId, iso) && l.kind !== 'login')
      : [];
  const lastOf = (kind: 'check-in' | 'check-out') =>
    [...dayLogs].reverse().find((l) => l.kind === kind) ?? null;
  const inGeo = lastOf('check-in');
  const outGeo = lastOf('check-out');

  let status = 'Working day';
  if (holiday) status = `Holiday — ${holiday.name}`;
  else if (weekend) status = 'Weekend';
  else if (future) status = 'Upcoming — not recorded yet';
  else if (iso === today) status = 'Today — in progress';
  else if (att) status = att.status === 'leave' ? att.leaveType || 'Leave' : ATTENDANCE_META[att.status].label;

  /* Applying is a self-service action — decided on the person's own records. */
  const myReq = myId ? requestOn(data.leaveRequests, myId, iso) : null;
  const canApply =
    iso >= today && !weekend && !holiday && !(myReq && (myReq.status === 'Pending' || myReq.status === 'Approved'));

  const rows: Array<string | [string, React.ReactNode]> = [
    ['Date', `${DAYS_LONG[parseISO(iso).getDay()]}, ${niceDate(iso)}`],
    ['Day status', status],
  ];

  /* Day-specific GPS rows appear only when a capture was permitted. */
  const geoLink = (point: GeoPoint) => (
    <a className="link" href={mapsUrl(point)} target="_blank" rel="noreferrer">
      <span className="num">
        {coordText(point)} ({accuracyText(point)})
      </span>
    </a>
  );
  if (showSelfAttendance) {
    rows.push(
      ['Check-in time', att?.checkIn ?? '--'],
      ['Check-out time', att?.checkOut ?? '--'],
      ['Total working hours', att?.workingHours ?? '--'],
    );
    if (inGeo) rows.push(['Check-in location', geoLink(inGeo)]);
    if (outGeo) rows.push(['Check-out location', geoLink(outGeo)]);
    rows.push(
      ['Late arrival', att?.lateBy ?? '--'],
      ['Early checkout', att?.earlyOut ?? '--'],
      ['Overtime', att?.overtime ?? '--'],
    );
  }

  return (
    <Modal
      title="Day Details"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Close
          </button>
          {canApply ? (
            <button className="btn btn-primary" onClick={() => onApply(iso)} type="button">
              Apply Leave
            </button>
          ) : null}
        </>
      }
    >
      <DetailList rows={rows} />

      <div className="card-head" style={{ marginTop: 18 }}>
        <div>
          <h2>Leave on this day</h2>
          <div className="sub">
            {showSelfAttendance ? 'Your requests covering this date' : 'Requests in the current scope covering this date'}
          </div>
        </div>
      </div>
      {dayEvents.length === 0 ? (
        <div className="empty">No leave request covers this date.</div>
      ) : (
        dayEvents.map((r) => {
          const emp = data.employees.find((e) => e.id === r.employeeId);
          const isOwn = r.employeeId === myId;
          return (
            <div className="event" key={r.id}>
              <span className="what">
                <b>
                  {isOwn ? (r.halfDay ? 'Half day · ' : '') : ''}
                  {isOwn ? r.type : `${emp?.name ?? r.employeeId} — ${r.type}`}
                </b>
                <span>
                  {dateRange(r.from, r.to)} · {r.days} day{r.days === 1 ? '' : 's'}
                  {r.reason ? ` · ${r.reason}` : ''}
                </span>
              </span>
              <span className={`cal-flag static-pill f-${r.status.toLowerCase()}`}>{r.status}</span>
              {onOpenRequest ? (
                <button className="btn btn-ghost btn-sm" onClick={() => onOpenRequest(r)} type="button">
                  View
                </button>
              ) : null}
            </div>
          );
        })
      )}
      <div className="info-note" style={{ marginTop: 12 }}>
        Status flags come straight from the stored request — nothing on this day is generated.
      </div>
    </Modal>
  );
}
