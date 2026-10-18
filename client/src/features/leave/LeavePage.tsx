/* ============================================================
   Leave & Attendance Calendar — the self-service leave screen.

   Summary cards, a month / week / agenda calendar built entirely
   from the stored leave records (never a generated event array),
   with status & scope filters, a per-day panel, a request dialog,
   the monthly attendance summary, upcoming leaves & holidays and
   the full request history with cancel.

   Managers can switch the calendar to their reporting line and HR
   to all employees; employees only ever see their own records.
   ============================================================ */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, Pill, Progress, StatChip } from '@/components/ui/primitives';
import { ApplyLeaveModal } from '@/features/leave/ApplyLeaveModal';
import { DayDetailsModal } from '@/features/leave/DayDetailsModal';
import { LeaveRequestModal } from '@/features/leave/LeaveRequestModal';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { teamIds } from '@/lib/lookups';
import {
  ATTENDANCE_META,
  LEAVE_STATUS_COLORS,
  LEAVE_TYPE_COLORS,
  attendanceOn,
  holidayOn,
  monthSummary,
  requestOn,
} from '@/lib/attendance';
import {
  DAYS,
  MONTHS,
  MONTHS_LONG,
  addDays,
  dateRange,
  daysInMonth,
  isWeekendISO,
  mondayOffset,
  niceDate,
  pad,
  parseISO,
  stampText,
  todayISO,
  weekStartISO,
} from '@/lib/date';
import type { LeaveRequest, LeaveStatus } from '@/types';

type CalView = 'month' | 'week' | 'agenda';
type ScopeMode = 'mine' | 'team' | 'all';
type StatusFilter = 'all' | LeaveStatus;

const STATUS_FLAG: Record<LeaveStatus, string> = {
  Pending: 'f-pending',
  Approved: 'f-approved',
  Rejected: 'f-rejected',
  Cancelled: 'f-cancelled',
};

const LEGEND_ITEMS: Array<{ shape: 'dot' | 'swatch'; color: string; label: string }> = [
  { shape: 'dot', color: '#22C55E', label: 'Present' },
  { shape: 'dot', color: '#EF4444', label: 'Absent' },
  { shape: 'dot', color: '#F97316', label: 'Half Day' },
  { shape: 'dot', color: '#8B5CF6', label: 'Work From Home' },
  { shape: 'dot', color: '#3B82F6', label: 'Paid Leave' },
  { shape: 'dot', color: '#F59E0B', label: 'Sick Leave' },
  { shape: 'dot', color: '#7FD4C1', label: 'Casual Leave' },
  { shape: 'swatch', color: 'var(--blue-tint)', label: 'Holiday' },
  { shape: 'swatch', color: 'var(--sidebar)', label: 'Weekend' },
  { shape: 'swatch', color: 'var(--amber-tint)', label: 'Pending Leave' },
  { shape: 'swatch', color: 'var(--teal-tint)', label: 'Approved Leave' },
  { shape: 'dot', color: '#EF4444', label: 'Rejected Leave' },
  { shape: 'dot', color: '#94A3B8', label: 'Cancelled Leave' },
];

type AgendaItem =
  | { date: string; kind: 'leave'; request: LeaveRequest }
  | { date: string; kind: 'holiday'; name: string };

export function LeavePage() {
  const { data, dispatch, audit, notify } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  /* Identity comes from the authenticated session only. */
  const myId = user?.employeeId ?? '';
  const me = data.employees.find((e) => e.id === myId);

  const now = new Date();
  const today = todayISO();
  const [view, setView] = useState<CalView>('month');
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('mine');
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<LeaveRequest | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [applyFor, setApplyFor] = useState<string | null>(null);

  const ctx = useMemo(
    () => ({ holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides }),
    [data.holidays, data.leaveRequests, data.attendanceOverrides],
  );

  const myRequests = useMemo(
    () =>
      data.leaveRequests
        .filter((r) => r.employeeId === myId)
        .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : a.appliedOn > b.appliedOn ? -1 : a.id < b.id ? 1 : -1)),
    [data.leaveRequests, myId],
  );

  /* -------- manager scope: the reporting line -------- */
  const teamScope = useMemo(
    () => (user?.portal === 'manager' && myId ? teamIds(data.employees, myId) : null),
    [user?.portal, myId, data.employees],
  );

  /* -------- calendar filters: status + permitted scope -------- */
  const canBrowseAll = user?.portal === 'hr';
  const canBrowseTeam = Boolean(teamScope && [...teamScope].some((id) => id !== myId));
  const effectiveScope: ScopeMode =
    scopeMode === 'all' && canBrowseAll ? 'all' : scopeMode === 'team' && canBrowseTeam ? 'team' : 'mine';

  const scopeIds = useMemo(() => {
    if (effectiveScope === 'all') return new Set(data.employees.map((e) => e.id));
    if (effectiveScope === 'team' && teamScope) return new Set([...teamScope].filter((id) => id !== myId));
    return new Set(myId ? [myId] : []);
  }, [effectiveScope, teamScope, data.employees, myId]);

  /* Events = stored requests inside the scope, narrowed by the status filter. */
  const events = useMemo(
    () =>
      data.leaveRequests
        .filter((r) => scopeIds.has(r.employeeId))
        .filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [data.leaveRequests, scopeIds, statusFilter],
  );

  const eventsOn = (iso: string) => events.filter((r) => iso >= r.from && iso <= r.to);

  const shortName = (employeeId: string) => {
    const e = data.employees.find((x) => x.id === employeeId);
    return e ? e.name.split(' ')[0] : employeeId;
  };

  const teamLeave = useMemo(() => {
    if (!teamScope) return [];
    const monthStart = `${cursor.year}-${pad(cursor.month + 1)}-01`;
    const monthEnd = `${cursor.year}-${pad(cursor.month + 1)}-${pad(daysInMonth(cursor.year, cursor.month))}`;
    return data.leaveRequests
      .filter((r) => r.employeeId !== myId && teamScope.has(r.employeeId))
      .filter((r) => (r.status === 'Approved' || r.status === 'Pending') && r.from <= monthEnd && r.to >= monthStart)
      .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  }, [teamScope, myId, data.leaveRequests, cursor]);

  const summary = useMemo(() => monthSummary(myId, cursor.year, cursor.month, ctx), [myId, cursor, ctx]);
  const pendingCount = myRequests.filter((r) => r.status === 'Pending').length;

  const upcoming = useMemo(() => {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 75);
    const items: Array<{ date: string; title: string; sub: string; flag: string; cls: string }> = [];
    myRequests.forEach((r) => {
      if (r.status === 'Approved' && r.from >= today) {
        items.push({
          date: r.from,
          title: `${r.halfDay ? 'Half Day · ' : ''}${r.type}`,
          sub: `${dateRange(r.from, r.to)} · ${r.days} ${r.days === 1 ? 'day' : 'days'}`,
          flag: r.type === 'Work From Home' ? 'WFH' : 'Approved',
          cls: 'f-approved',
        });
      }
    });
    data.holidays.forEach((h) => {
      if (h.date >= today && parseISO(h.date) <= horizon) {
        items.push({
          date: h.date,
          title: h.name,
          sub: `${niceDate(h.date)} · Company holiday`,
          flag: 'Holiday',
          cls: 'f-holiday',
        });
      }
    });
    return items.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5);
  }, [myRequests, data.holidays, today]);

  /* -------- month view: calendar cells -------- */
  const cells = useMemo(() => {
    const { year, month } = cursor;
    const offset = mondayOffset(year, month);
    const total = daysInMonth(year, month);
    const self = effectiveScope === 'mine';
    const out: Array<null | {
      iso: string;
      day: number;
      weekend: boolean;
      holidayName: string | null;
      req: LeaveRequest | null;
      attStatus: string | null;
      attColor: string | null;
      txt: string;
      dayEvents: LeaveRequest[];
    }> = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let day = 1; day <= total; day++) {
      const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
      const weekend = isWeekendISO(iso);
      const holiday = holidayOn(data.holidays, iso);
      const dayEvents = events.filter((r) => iso >= r.from && iso <= r.to);

      let txt = '';
      let attColor: string | null = null;
      let req: LeaveRequest | null = null;
      let attStatus: string | null = null;
      if (self && myId) {
        const att = attendanceOn(myId, iso, ctx);
        req = requestOn(data.leaveRequests, myId, iso);
        attStatus = att?.status ?? null;
        if (holiday) {
          txt = holiday.name;
          attColor = '#3B82F6';
        } else if (req && req.status !== 'Rejected') {
          txt = `${req.halfDay ? 'Half Day · ' : ''}${req.type}`;
          attColor = LEAVE_TYPE_COLORS[req.type] ?? '#F59E0B';
        } else if (att) {
          const meta = ATTENDANCE_META[att.status];
          txt = att.status === 'leave' ? att.leaveType || 'Leave' : meta.label;
          attColor = att.status === 'leave' ? LEAVE_TYPE_COLORS[att.leaveType ?? ''] ?? meta.color : meta.color;
        } else if (weekend) {
          txt = 'Weekend';
        }
      } else if (holiday) {
        txt = holiday.name;
      } else if (weekend) {
        txt = 'Weekend';
      }
      out.push({ iso, day, weekend, holidayName: holiday?.name ?? null, req, attStatus, attColor, txt, dayEvents });
    }
    return out;
  }, [cursor, data.holidays, data.leaveRequests, events, myId, ctx, effectiveScope]);

  const monthHasEvents = cells.some((c) => c && c.dayEvents.length > 0);

  /* -------- week view -------- */
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekLabel = useMemo(() => {
    const a = parseISO(weekStart);
    const b = parseISO(addDays(weekStart, 6));
    const month = a.getMonth() === b.getMonth() ? '' : ` ${MONTHS[b.getMonth()]}`;
    return `${pad(a.getDate())} ${MONTHS[a.getMonth()]} – ${pad(b.getDate())}${month} ${b.getFullYear()}`;
  }, [weekStart]);

  /* -------- agenda view: the month's events grouped by day -------- */
  const agenda = useMemo<AgendaItem[]>(() => {
    const monthStart = `${cursor.year}-${pad(cursor.month + 1)}-01`;
    const monthEnd = `${cursor.year}-${pad(cursor.month + 1)}-${pad(daysInMonth(cursor.year, cursor.month))}`;
    const items: AgendaItem[] = [];
    events.forEach((r) => {
      if (r.from >= monthStart && r.from <= monthEnd) items.push({ date: r.from, kind: 'leave', request: r });
    });
    data.holidays.forEach((h) => {
      if (h.date >= monthStart && h.date <= monthEnd) items.push({ date: h.date, kind: 'holiday', name: h.name });
    });
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'holiday' && b.kind === 'leave' ? -1 : 1));
  }, [cursor, events, data.holidays]);

  /* Keep the side cards (monthly attendance, team on leave) aligned with
     the month the week view is actually showing. */
  const followMonth = (iso: string) => {
    const d = parseISO(iso);
    setCursor((c) =>
      c.year === d.getFullYear() && c.month === d.getMonth() ? c : { year: d.getFullYear(), month: d.getMonth() },
    );
  };

  const move = (dir: -1 | 1 | 'today') => {
    if (view === 'week') {
      const next = dir === 'today' ? weekStartISO(today) : addDays(weekStart, dir * 7);
      setWeekStart(next);
      followMonth(next);
      return;
    }
    if (dir === 'today') {
      setCursor({ year: now.getFullYear(), month: now.getMonth() });
      return;
    }
    setCursor((c) => {
      let month = c.month + dir;
      let year = c.year;
      if (month < 0) {
        month = 11;
        year--;
      }
      if (month > 11) {
        month = 0;
        year++;
      }
      return { year, month };
    });
  };

  /* Switching from a month/agenda position to the week view jumps to that
     month's first week instead of a stale one. */
  const switchView = (v: CalView) => {
    if (v === 'week') {
      const cur = parseISO(weekStart);
      if (cur.getFullYear() !== cursor.year || cur.getMonth() !== cursor.month) {
        setWeekStart(weekStartISO(`${cursor.year}-${pad(cursor.month + 1)}-01`));
      }
    }
    setView(v);
  };

  const cancelRequest = (req: LeaveRequest) => {
    dispatch({
      type: 'update',
      collection: 'leaveRequests',
      id: req.id,
      patch: { status: 'Cancelled', decidedAt: new Date().toISOString() },
    });
    audit('Leave request cancelled', req.id, me?.name ?? 'Employee');
    notify(`${me?.name ?? 'An employee'} cancelled leave ${req.id}`);
    toast(`Leave request ${req.id} cancelled.`);
  };

  /* "Show in my requests" — close the dialog, flash and scroll to the row. */
  const showInList = (id: string) => {
    setOpenRequest(null);
    setFlashId(id);
    window.setTimeout(() => {
      document.getElementById(`lr-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 2400);
  };

  const balance = data.leaveBalance;
  const scopeLabel = effectiveScope === 'all' ? 'All employees' : effectiveScope === 'team' ? 'My team' : 'My leave';

  return (
    <div className="leave-page">
      {/* ---------- summary cards ---------- */}
      <div className="leave-summary">
        <SumCard
          label="Total Leave Balance"
          value={balance.total}
          sub={`${balance.total - balance.used} available · ${balance.used} used`}
        />
        <SumCard label="Casual Leave" value={balance.casual} sub="remaining" />
        <SumCard label="Sick Leave" value={balance.sick} sub="remaining" />
        <SumCard label="Paid / Earned Leave" value={balance.paidEarned} sub="remaining" />
        <SumCard label="Leaves Taken" value={balance.used} sub="this year" />
        <SumCard
          label="Pending Requests"
          value={pendingCount}
          sub={pendingCount ? 'awaiting approval' : 'all clear'}
        />
      </div>

      <div className="grid">
        {/* ---------- calendar ---------- */}
        <section className="card span8" aria-labelledby="calH">
          <div className="card-head">
            <div>
              <h2 id="calH">My Leave &amp; Attendance Calendar</h2>
              <div className="sub">
                {effectiveScope === 'mine'
                  ? `${me?.name ?? 'Employee'} · ${me?.id ?? myId} — attendance is read-only; apply for leave for today or a future date.`
                  : `Browsing ${scopeLabel.toLowerCase()} — read-only; apply for your own leave from My leave.`}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setApplyFor(today)} type="button">
              <Icon name="plus" size={15} /> Apply for leave
            </button>
          </div>

          <div className="cal-toolbar">
            <button
              className="icon-btn icon-btn-sm"
              onClick={() => move(-1)}
              aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
              type="button"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => move('today')} type="button">
              Today
            </button>
            <button
              className="icon-btn icon-btn-sm"
              onClick={() => move(1)}
              aria-label={view === 'week' ? 'Next week' : 'Next month'}
              type="button"
            >
              <Icon name="chevronRight" size={16} />
            </button>
            <h3 className="cal-month" aria-live="polite">
              {view === 'week' ? weekLabel : `${MONTHS_LONG[cursor.month]} ${cursor.year}`}
            </h3>
            <span className="spacer" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by leave status"
            >
              <option value="all">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            {canBrowseAll || canBrowseTeam ? (
              <select
                value={effectiveScope}
                onChange={(e) => setScopeMode(e.target.value as ScopeMode)}
                aria-label="Calendar scope"
              >
                <option value="mine">My leave</option>
                {canBrowseTeam ? <option value="team">My team</option> : null}
                {canBrowseAll ? <option value="all">All employees</option> : null}
              </select>
            ) : null}
            <div className="segmented" role="tablist" aria-label="Calendar view">
              <button
                className={`seg-btn${view === 'month' ? ' on' : ''}`}
                role="tab"
                aria-selected={view === 'month'}
                onClick={() => switchView('month')}
                type="button"
              >
                Month
              </button>
              <button
                className={`seg-btn${view === 'week' ? ' on' : ''}`}
                role="tab"
                aria-selected={view === 'week'}
                onClick={() => switchView('week')}
                type="button"
              >
                Week
              </button>
              <button
                className={`seg-btn${view === 'agenda' ? ' on' : ''}`}
                role="tab"
                aria-selected={view === 'agenda'}
                onClick={() => switchView('agenda')}
                type="button"
              >
                Agenda
              </button>
            </div>
          </div>

          <div className="cal-legend">
            {LEGEND_ITEMS.map((item) => (
              <span className="li" key={item.label}>
                {item.shape === 'dot' ? (
                  <span className="cal-dot" style={{ background: item.color }} />
                ) : (
                  <span className="cal-swatch" style={{ background: item.color }} />
                )}
                {item.label}
              </span>
            ))}
          </div>

          {view === 'month' ? (
            <>
              <div className="cal-weekdays" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6, 0].map((i) => (
                  <span key={i}>{DAYS[i]}</span>
                ))}
              </div>
              <div className="cal-grid">
                {cells.map((cell, i) => {
                  if (cell === null) {
                    return <span className="cal-day blank" key={`blank-${i}`} aria-hidden="true" />;
                  }
                  const self = effectiveScope === 'mine';
                  const pendingDay = self
                    ? cell.req?.status === 'Pending'
                    : cell.dayEvents.some((r) => r.status === 'Pending');
                  const approvedDay = self
                    ? cell.req?.status === 'Approved'
                    : cell.dayEvents.some((r) => r.status === 'Approved');
                  const aria =
                    `${cell.day} ${MONTHS[cursor.month]} ${cursor.year}` +
                    (cell.txt ? ` — ${cell.txt}` : '') +
                    (!self && cell.dayEvents.length
                      ? ` — ${cell.dayEvents.length} leave request${cell.dayEvents.length === 1 ? '' : 's'}`
                      : '');
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={[
                        'cal-day',
                        cell.weekend ? 'weekend' : '',
                        cell.holidayName ? 'holiday' : '',
                        pendingDay ? 'pending' : '',
                        approvedDay && !cell.holidayName ? 'approved' : '',
                        cell.iso === today ? 'today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setDayIso(cell.iso)}
                      aria-label={aria}
                    >
                      <span className="cal-num">{cell.day}</span>
                      {self && cell.req ? (
                        <span className={`cal-flag ${STATUS_FLAG[cell.req.status]}`}>{cell.req.status}</span>
                      ) : !self && cell.holidayName ? (
                        <span className="cal-flag f-holiday">Holiday</span>
                      ) : null}
                      {self && cell.txt ? (
                        <span className="cal-cell-status">
                          {cell.attColor ? <span className="cal-dot" style={{ background: cell.attColor }} /> : null}
                          <span className="txt">{cell.txt}</span>
                        </span>
                      ) : null}
                      {!self && cell.dayEvents.length ? (
                        <span className="cal-cell-events">
                          {cell.dayEvents.slice(0, 2).map((r) => (
                            <span className="cal-ev" key={r.id} title={`${shortName(r.employeeId)} — ${r.type} (${r.status})`}>
                              <span className="cal-dot" style={{ background: LEAVE_STATUS_COLORS[r.status] }} />
                              <span className="nm">{shortName(r.employeeId)}</span>
                            </span>
                          ))}
                          {cell.dayEvents.length > 2 ? (
                            <span className="cal-more">+{cell.dayEvents.length - 2} more</span>
                          ) : null}
                        </span>
                      ) : null}
                      {!self && !cell.dayEvents.length && cell.txt ? (
                        <span className="cal-cell-status">
                          <span className="txt">{cell.txt}</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {!monthHasEvents ? (
                <div className="empty" style={{ marginTop: 10 }}>
                  {effectiveScope === 'mine'
                    ? 'No leave requests on your calendar this month.'
                    : `No ${scopeLabel.toLowerCase()} leave matches the current filters in ${MONTHS_LONG[cursor.month]} ${cursor.year}.`}
                </div>
              ) : null}
            </>
          ) : view === 'week' ? (
            <div className="cal-week">
              {weekDays.map((iso) => {
                const d = parseISO(iso);
                const weekend = isWeekendISO(iso);
                const holiday = holidayOn(data.holidays, iso);
                const dayEvents = eventsOn(iso);
                return (
                  <div
                    className={['cal-week-col', weekend ? 'weekend' : '', iso === today ? 'today' : ''].filter(Boolean).join(' ')}
                    key={iso}
                  >
                    <button
                      className="cal-week-head"
                      onClick={() => setDayIso(iso)}
                      type="button"
                      aria-label={`Day details for ${niceDate(iso)}`}
                    >
                      <b>{pad(d.getDate())}</b>
                      <span>{DAYS[d.getDay()]}</span>
                      {holiday ? <span className="cal-week-hol">{holiday.name}</span> : null}
                    </button>
                    {dayEvents.length === 0 ? (
                      <span className="cal-week-none">—</span>
                    ) : (
                      dayEvents.map((r) => (
                        <button
                          className="cal-ev"
                          key={r.id}
                          onClick={() => setOpenRequest(r)}
                          type="button"
                          title={`${shortName(r.employeeId)} — ${r.type} (${r.status})`}
                        >
                          <span className="cal-dot" style={{ background: LEAVE_STATUS_COLORS[r.status] }} />
                          <span className="nm">
                            {effectiveScope === 'mine'
                              ? `${r.halfDay ? 'Half · ' : ''}${r.type}`
                              : shortName(r.employeeId)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          ) : agenda.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing on the calendar"
              sub={`No leave or holidays in ${MONTHS_LONG[cursor.month]} ${cursor.year} for the current filters.`}
            />
          ) : (
            <div className="cal-agenda">
              {agenda.map((item, i) => {
                const prev = agenda[i - 1];
                const showDate = !prev || prev.date !== item.date;
                const d = parseISO(item.date);
                if (item.kind === 'holiday') {
                  return (
                    <button className="event as-button" key={`h-${item.date}`} onClick={() => setDayIso(item.date)} type="button">
                      <span className="date-chip" style={showDate ? undefined : { visibility: 'hidden' }} aria-hidden={!showDate}>
                        <b>{pad(d.getDate())}</b>
                        <span>{MONTHS[d.getMonth()].toUpperCase()}</span>
                      </span>
                      <span className="what">
                        <b>{item.name}</b>
                        <span>{niceDate(item.date)} · Company holiday</span>
                      </span>
                      <span className="cal-flag static-pill f-holiday">Holiday</span>
                    </button>
                  );
                }
                const r = item.request;
                return (
                  <button
                    className="event as-button"
                    key={r.id}
                    onClick={() => setOpenRequest(r)}
                    type="button"
                    title={`Open ${r.id}`}
                  >
                    <span className="date-chip" style={showDate ? undefined : { visibility: 'hidden' }} aria-hidden={!showDate}>
                      <b>{pad(d.getDate())}</b>
                      <span>{MONTHS[d.getMonth()].toUpperCase()}</span>
                    </span>
                    <span className="what">
                      <b>
                        {effectiveScope === 'mine'
                          ? `${r.halfDay ? 'Half day · ' : ''}${r.type}`
                          : `${shortName(r.employeeId)} — ${r.type}`}
                      </b>
                      <span>
                        {r.id} · {dateRange(r.from, r.to)} · {r.days} day{r.days === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className={`cal-flag static-pill ${STATUS_FLAG[r.status]}`}>{r.status}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- side column ---------- */}
        <div className="leave-side span4">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Monthly attendance</h2>
                <div className="sub">
                  {MONTHS[cursor.month]} {cursor.year} · {summary.working} working days
                </div>
              </div>
            </div>
            <div className="cal-statgrid">
              <span className="stat">
                Present <b>{summary.present}</b>
              </span>
              <span className="stat">
                Absent <b>{summary.absent}</b>
              </span>
              <span className="stat">
                Leave days <b>{summary.leave}</b>
              </span>
              <span className="stat">
                Half days <b>{summary.half}</b>
              </span>
              <span className="stat">
                WFH days <b>{summary.wfh}</b>
              </span>
              <span className="stat">
                Working days <b>{summary.working}</b>
              </span>
            </div>
            <Progress label="Attendance (authorised leave excluded)" value={summary.pct ?? 0} />
            <div className="info-note">
              Attendance rate counts present + WFH + half days over completed working days; approved leave is excluded
              from the denominator — the standard HR definition.
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Upcoming</h2>
                <div className="sub">Approved leave &amp; holidays, next 75 days</div>
              </div>
            </div>
            {upcoming.length ? (
              upcoming.map((item) => {
                const d = parseISO(item.date);
                return (
                  <div className="event" key={`${item.date}-${item.title}`}>
                    <span className="date-chip">
                      <b>{pad(d.getDate())}</b>
                      <span>{MONTHS[d.getMonth()].toUpperCase()}</span>
                    </span>
                    <span className="what">
                      <b>{item.title}</b>
                      <span>{item.sub}</span>
                    </span>
                    <span className={`cal-flag static-pill ${item.cls}`}>{item.flag}</span>
                  </div>
                );
              })
            ) : (
              <div className="empty">Nothing coming up in the next few weeks.</div>
            )}
          </section>

          {teamScope ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Team on leave</h2>
                  <div className="sub">
                    {MONTHS[cursor.month]} {cursor.year} · your reporting line
                  </div>
                </div>
              </div>
              {teamLeave.length ? (
                teamLeave.map((r) => {
                  const d = parseISO(r.from);
                  const emp = data.employees.find((e) => e.id === r.employeeId);
                  return (
                    <div className="event" key={r.id}>
                      <span className="date-chip">
                        <b>{pad(d.getDate())}</b>
                        <span>{MONTHS[d.getMonth()].toUpperCase()}</span>
                      </span>
                      <span className="what">
                        <b>{emp?.name ?? r.employeeId}</b>
                        <span>
                          {r.halfDay ? 'Half day · ' : ''}
                          {r.type} · {dateRange(r.from, r.to)} · {r.days} {r.days === 1 ? 'day' : 'days'}
                        </span>
                      </span>
                      <span className={`cal-flag static-pill ${r.status === 'Pending' ? 'f-pending' : 'f-approved'}`}>
                        {r.status}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="empty">No team leave in {MONTHS[cursor.month]}.</div>
              )}
              <div className="card-foot">Read-only view — decisions happen in Leave Approvals.</div>
            </section>
          ) : null}
        </div>
      </div>

      {/* ---------- history ---------- */}
      <section className="card" aria-labelledby="histH">
        <div className="card-head">
          <div>
            <h2 id="histH">My leave requests</h2>
            <div className="sub">Every request and its approval state</div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Request</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Applied on</th>
                <th>Status</th>
                <th>Reason / note</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {myRequests.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">No leave requests yet — use “Apply for leave”.</div>
                  </td>
                </tr>
              ) : (
                myRequests.map((r) => (
                  <tr key={r.id} id={`lr-${r.id}`} className={flashId === r.id ? 'row-flash' : undefined}>
                    <td className="num">{r.id}</td>
                    <td>
                      {r.type}
                      {r.halfDay ? ' (half)' : ''}
                    </td>
                    <td className="num">{dateRange(r.from, r.to)}</td>
                    <td className="num">{r.days}</td>
                    <td className="num">{niceDate(r.appliedOn)}</td>
                    <td>
                      <Pill status={r.status} />
                    </td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                      {r.reason}
                      {r.managerNote ? <span style={{ color: 'var(--text-2)' }}> — {r.managerNote}</span> : null}
                      {r.decidedAt ? (
                        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                          {r.status === 'Cancelled' ? 'Cancelled' : 'Decided'} {stampText(r.decidedAt)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="act-btns">
                        <button className="btn btn-outline btn-sm" onClick={() => setOpenRequest(r)} type="button">
                          View
                        </button>
                        {r.status === 'Pending' ? (
                          <button className="btn btn-danger-outline btn-sm" onClick={() => cancelRequest(r)} type="button">
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dayIso ? (
        <DayDetailsModal
          iso={dayIso}
          onClose={() => setDayIso(null)}
          onApply={(iso) => {
            setDayIso(null);
            setApplyFor(iso);
          }}
          events={eventsOn(dayIso)}
          showSelfAttendance={effectiveScope === 'mine'}
          onOpenRequest={(r) => {
            setDayIso(null);
            setOpenRequest(r);
          }}
        />
      ) : null}

      {openRequest ? (
        <LeaveRequestModal
          request={openRequest}
          onClose={() => setOpenRequest(null)}
          onShowInList={openRequest.employeeId === myId ? showInList : undefined}
          onOpenApprovals={
            user?.portal === 'hr' || user?.portal === 'manager' ? () => navigate('/leave-approvals') : undefined
          }
          onCancel={(r) => {
            cancelRequest(r);
            setOpenRequest(null);
          }}
        />
      ) : null}

      {applyFor ? <ApplyLeaveModal presetDate={applyFor} onClose={() => setApplyFor(null)} /> : null}
    </div>
  );
}

function SumCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="card leave-sumcard">
      <span className="hlc-label">{label}</span>
      <span className="hlc-value">{value}</span>
      <span className="hlc-sub">{sub}</span>
    </div>
  );
}

/* StatChip is exported through primitives; re-export keeps vendor imports tidy. */
export { StatChip };
