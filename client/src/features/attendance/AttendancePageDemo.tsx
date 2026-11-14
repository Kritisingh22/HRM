/* ============================================================
   Attendance — demo (non-API) read-only register derived from roster.

   HR/Admin see the whole company, managers see their reporting
   line, employees see themselves. Two views: a monthly register
   for one employee and a single-day register for the team.
   Employees get the self-service variant only.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CheckInCard } from '@/components/attendance/CheckInCard';
import { EmpCell, StatRow, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { teamIds } from '@/lib/lookups';
import { accuracyText, coordText, mapsUrl } from '@/lib/geo';
import {
  ATTENDANCE_META,
  attendanceOn,
  holidayOn,
  monthSummary,
  overrideKey,
} from '@/lib/attendance';
import {
  DAYS,
  daysInMonth,
  isWeekend,
  lastMonths,
  parseISO,
  shortDate,
  todayISO,
} from '@/lib/date';
import { pad } from '@/lib/date';
import { filterDemoEmployees } from '@/lib/lookups';
import type { AttendanceStatus } from '@/types';

const STATUSES: AttendanceStatus[] = ['present', 'wfh', 'halfday', 'leave', 'absent'];

function StatusCell({ status, label }: { status: AttendanceStatus | null; label?: string }) {
  if (!status) return <span style={{ color: 'var(--muted)' }}>{label ?? '—'}</span>;
  const meta = ATTENDANCE_META[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span className="cal-dot" style={{ background: meta.color }} />
      {label ?? meta.label}
    </span>
  );
}

export function AttendancePageDemo() {
  const { data } = useApp();
  const { user, canManage } = useAuth();

  const myId = user?.employeeId ?? '';
  const isSelf = user?.portal === 'employee';
  const showSelfCard = !!myId && user?.role !== 'SUPER_ADMIN';

  const scope = useMemo(() => {
    const filtered = filterDemoEmployees(data.employees);
    if (isSelf) return filtered.filter((e) => e.id === myId);
    if (user?.portal === 'manager' && myId) {
      const ids = teamIds(filtered, myId);
      return filtered.filter((e) => ids.has(e.id));
    }
    return filtered;
  }, [data.employees, isSelf, user?.portal, myId]);

  const months = useMemo(() => lastMonths(14).reverse(), []);
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [empId, setEmpId] = useState(isSelf ? myId : scope[0]?.id ?? myId);
  const [day, setDay] = useState(todayISO());
  const [tab, setTab] = useState<'month' | 'day'>('month');

  const [py, pm] = period.split('-').map(Number);
  const ctx = useMemo(
    () => ({ holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides }),
    [data.holidays, data.leaveRequests, data.attendanceOverrides],
  );

  const employee = data.employees.find((e) => e.id === empId) ?? scope[0] ?? null;
  const summary = useMemo(
    () => (employee ? monthSummary(employee.id, py, pm - 1, ctx) : null),
    [employee, py, pm, ctx],
  );

  const monthRows = useMemo(() => {
    if (!employee) return [];
    const total = daysInMonth(py, pm - 1);
    const out: Array<{
      iso: string;
      day: string;
      weekday: string;
      kind: 'weekend' | 'holiday' | 'today' | 'future' | 'record';
      holiday?: string;
      record: ReturnType<typeof attendanceOn>;
    }> = [];
    for (let d = 1; d <= total; d++) {
      const iso = `${py}-${pad(pm)}-${pad(d)}`;
      const date = parseISO(iso);
      const holiday = holidayOn(data.holidays, iso);
      const weekend = isWeekend(date);
      let kind: 'weekend' | 'holiday' | 'today' | 'future' | 'record' = 'record';
      if (weekend) kind = 'weekend';
      else if (holiday) kind = 'holiday';
      else if (iso === todayISO()) kind = 'today';
      else if (iso > todayISO()) kind = 'future';
      const checkedInToday = kind === 'today' && Boolean(data.attendanceOverrides[overrideKey(employee.id, iso)]);
      out.push({
        iso,
        day: pad(d),
        weekday: DAYS[date.getDay()],
        kind,
        holiday: holiday?.name,
        record: kind === 'record' || checkedInToday ? attendanceOn(employee.id, iso, ctx) : null,
      });
    }
    return out;
  }, [employee, py, pm, data.holidays, ctx]);

  const dayRows = useMemo(() => {
    const weekend = isWeekend(parseISO(day));
    const holiday = holidayOn(data.holidays, day);
    const lastLog = (ref: string, kind: 'check-in' | 'check-out') => {
      for (let i = data.locationLog.length - 1; i >= 0; i--) {
        const l = data.locationLog[i];
        if (l.ref === ref && l.kind === kind) return l;
      }
      return null;
    };
    return {
      weekend,
      holiday,
      future: day > todayISO(),
      rows: scope.map((e) => {
        const record = weekend || holiday || day >= todayISO() ? null : attendanceOn(e.id, day, ctx);
        const ref = overrideKey(e.id, day);
        const geoIn = record ? lastLog(ref, 'check-in') : null;
        const geoOut = record ? lastLog(ref, 'check-out') : null;
        return {
          employee: e,
          record,
          geo: geoIn ?? geoOut,
          geoKind: geoIn ? ('check-in' as const) : geoOut ? ('check-out' as const) : null,
        };
      }),
    };
  }, [scope, day, data.holidays, data.locationLog, ctx]);

  const dayStats = useMemo(() => {
    let present = 0;
    let wfh = 0;
    let leave = 0;
    let absent = 0;
    let pending = 0;
    dayRows.rows.forEach(({ record }) => {
      if (!record) {
        pending++;
        return;
      }
      if (record.status === 'present') present++;
      else if (record.status === 'wfh') wfh++;
      else if (record.status === 'leave') leave++;
      else if (record.status === 'absent') absent++;
      else if (record.status === 'halfday') present += 0.5;
    });
    return { present, wfh, leave, absent, pending };
  }, [dayRows]);

  const showTabs = canManage || user?.portal === 'manager';

  return (
    <div className="grid">
      {showSelfCard ? <CheckInCard /> : null}

      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{showSelfCard ? 'My Attendance' : 'Attendance Register'}</h2>
            <div className="sub">
              {showSelfCard
                ? 'Earlier days are recorded by the system; today is yours to check in and out from the card above'
                : 'Derived from the roster, leave approvals and company holidays — read-only by design'}
            </div>
          </div>
          {summary && tab === 'month' ? (
            <span className="chip">{summary.pct === null ? 'Month in progress' : `${summary.pct}% attendance`}</span>
          ) : null}
        </div>

        {showTabs ? (
          <Tabs
            tabs={[
              { key: 'month', label: 'Monthly register' },
              { key: 'day', label: 'Team day register' },
            ]}
            active={tab}
            onChange={(k) => setTab(k as 'month' | 'day')}
          />
        ) : null}

        {tab === 'month' ? (
          <>
            <div className="toolbar" style={{ marginTop: 14 }}>
              {canManage ? (
                <select value={empId} onChange={(e) => setEmpId(e.target.value)} aria-label="Employee">
                  {scope.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.designation}
                    </option>
                  ))}
                </select>
              ) : null}
              <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month">
                {months.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} {m.y}
                  </option>
                ))}
              </select>
              <span className="spacer" />
              {employee ? (
                <span className="chip">{employee.name} · {employee.id}</span>
              ) : null}
            </div>

            {summary ? (
              <StatRow
                items={[
                  { k: 'Present', v: summary.present, s: 'days in office' },
                  { k: 'Work from home', v: summary.wfh, s: 'approved WFH' },
                  { k: 'Half days', v: summary.half, s: '0.5 day each' },
                  { k: 'On leave', v: summary.leave, s: 'authorised' },
                  { k: 'Absent', v: summary.absent, s: 'no record' },
                  { k: 'Working days', v: summary.working, s: `${summary.elapsed} elapsed` },
                  { k: 'Attendance %', v: summary.pct === null ? '—' : `${summary.pct}%`, s: 'leave excluded' },
                ]}
              />
            ) : null}

            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Status</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Hours</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((row) => {
                    const rec = row.record;
                    const notes: string[] = [];
                    if (rec?.lateBy) notes.push(`Late by ${rec.lateBy}`);
                    if (rec?.earlyOut) notes.push(`Early out ${rec.earlyOut}`);
                    if (rec?.overtime) notes.push(`Overtime ${rec.overtime}`);
                    return (
                      <tr key={row.iso}>
                        <td className="num">{shortDate(row.iso)}</td>
                        <td>{row.weekday}</td>
                        <td>
                          {row.kind === 'weekend' ? (
                            <span style={{ color: 'var(--muted)' }}>Weekend</span>
                          ) : row.kind === 'holiday' ? (
                            <span style={{ color: 'var(--amber)' }}>Holiday · {row.holiday}</span>
                          ) : row.kind === 'today' ? (
                            rec ? (
                              <StatusCell
                                status={rec.status ?? null}
                                label={rec.status === 'leave' && rec.leaveType ? `Leave · ${rec.leaveType}` : undefined}
                              />
                            ) : (
                              <span style={{ color: 'var(--text-2)' }}>Today — in progress</span>
                            )
                          ) : row.kind === 'future' ? (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          ) : (
                            <StatusCell
                              status={rec?.status ?? null}
                              label={rec?.status === 'leave' && rec?.leaveType ? `Leave · ${rec.leaveType}` : undefined}
                            />
                          )}
                        </td>
                        <td className="num">{rec?.checkIn ?? '—'}</td>
                        <td className="num">{rec?.checkOut ?? '—'}</td>
                        <td className="num">{rec?.workingHours ?? '—'}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{notes.join(' · ') || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="card-foot">
              Legend:{' '}
              {STATUSES.map((s) => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
                  <span className="cal-dot" style={{ background: ATTENDANCE_META[s].color }} />
                  {ATTENDANCE_META[s].label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="toolbar" style={{ marginTop: 14 }}>
              <input
                type="date"
                className="input"
                style={{ width: 170 }}
                max={todayISO()}
                value={day}
                onChange={(e) => setDay(e.target.value || todayISO())}
                aria-label="Register date"
              />
              <span className="spacer" />
              <span className="chip">{scope.length} people in scope</span>
            </div>

            <StatRow
              items={[
                { k: 'Present', v: dayStats.present, s: 'incl. half days' },
                { k: 'Work from home', v: dayStats.wfh },
                { k: 'On leave', v: dayStats.leave },
                { k: 'Absent', v: dayStats.absent },
                { k: 'No record', v: dayStats.pending, s: 'future / holiday / today' },
              ]}
            />

            {dayRows.weekend || dayRows.holiday || dayRows.future ? (
              <div className="info-note" style={{ marginBottom: 14 }}>
                <Icon name="info" size={14} />{' '}
                {dayRows.weekend
                  ? 'That day falls on a weekend — no attendance is recorded.'
                  : dayRows.holiday
                    ? `That day is a company holiday (${dayRows.holiday.name}).`
                    : 'That day is today or in the future — attendance is still open.'}
              </div>
            ) : null}

            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Hours</th>
                    <th>Location</th>
                    <th>Late / early</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.rows.map(({ employee: e, record, geo, geoKind }) => (
                    <tr key={e.id}>
                      <td>
                        <EmpCell name={e.name} sub={e.designation} seed={e.id} />
                      </td>
                      <td>{data.departments.find((d) => d.id === e.dept)?.name ?? e.dept}</td>
                      <td>
                        <StatusCell status={record?.status ?? null} />
                      </td>
                      <td className="num">{record?.checkIn ?? '—'}</td>
                      <td className="num">{record?.checkOut ?? '—'}</td>
                      <td className="num">{record?.workingHours ?? '—'}</td>
                      <td className="num">
                        {geo ? (
                          <a
                            className="link"
                            href={mapsUrl(geo)}
                            target="_blank"
                            rel="noreferrer"
                            title={`Recorded at ${geoKind} · ${accuracyText(geo)}`}
                          >
                            {coordText(geo)}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {[record?.lateBy && `Late ${record.lateBy}`, record?.earlyOut && `Early ${record.earlyOut}`]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card-foot">
              Overrides entered by HR are honoured first; everything else is derived from the roster so the demo never
              drifts. Location links appear only where a check-in/out capture was recorded.{' '}
              {data.attendanceOverrides[overrideKey(empId, day)] ? 'An explicit override exists for this employee/day.' : ''}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
