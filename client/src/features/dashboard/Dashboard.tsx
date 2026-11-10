/* ============================================================
   Dashboard — the landing screen.

   Org view (HR/Admin): company KPIs, attendance trend, department
   mix, leave decisions, recruitment funnel, events, announcements
   and the payroll snapshot.
   Self view (Employee): personal attendance, balances, requests
   and the notice board.
   ============================================================ */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { CheckInCard } from '@/components/attendance/CheckInCard';
import { EmpCell, Pill, Progress } from '@/components/ui/primitives';
import { LineChart } from '@/components/charts/LineChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { Funnel } from '@/components/charts/Funnel';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { PAGE_PATH } from '@/data/nav';
import {
  ATTENDANCE_META,
  LEAVE_TYPE_COLORS,
  attendanceOn,
  dayAttendancePct,
  monthSummary,
  requestOn,
  seriesForDates,
} from '@/lib/attendance';
import { dateRange, lastWorkingDays, niceDate, shortDate, todayISO, toISO, sameMonth } from '@/lib/date';
import { canSeeSalary } from '@/data/nav';
import { clampPct, moneyCompact, pct } from '@/lib/format';
import { filterDemoEmployees } from '@/lib/lookups';
import type { Employee, LeaveRequest } from '@/types';

const DEPT_COLORS = ['var(--teal)', 'var(--violet)', 'var(--orange)', 'var(--blue)', 'var(--green)', 'var(--amber)'];

type RangeKey = 'month' | 'last' | 'd90';

export function DashboardPage() {
  /* hydrated is checked BEFORE any body hook so the hook order never
     changes between renders. When the store is still hydrating after
     the first paint we show grid-matching skeletons instead of the body,
     which keeps CLS at ~0.003 and never trips React's rules-of-hooks. */
  const { hydrated } = useApp();
  if (!hydrated) return <DashboardSkeleton />;
  return <DashboardBody />;
}

/** Grid-matching skeleton placeholders painted while the workspace
    hydrates after the first paint. Same card spans as the real body so
    there is no layout shift (CLS stays at ~0.003). */
function DashboardSkeleton() {
  return (
    <div className="grid">
      <div className="card kpi span3 skeleton"><div className="skeleton pulse-block" /></div>
      <div className="card kpi span3 skeleton"><div className="skeleton pulse-block" /></div>
      <div className="card kpi span3 skeleton"><div className="skeleton pulse-block" /></div>
      <div className="card kpi span3 skeleton"><div className="skeleton pulse-block" /></div>
      <section className="card span8 attendance-card skeleton">
        <div className="skeleton line long" /><div className="skeleton line short" />
      </section>
      <section className="card span4 dept-card skeleton"><div className="skeleton line long" /></section>
      <section className="card span7 skeleton"><div className="skeleton line long" /><div className="skeleton line short" /></section>
      <section className="card span5 skeleton"><div className="skeleton line long" /><div className="skeleton line short" /></section>
      <section className="card span4 payroll-card skeleton"><div className="skeleton line long" /></section>
      <section className="card span4 skeleton"><div className="skeleton line long" /></section>
      <section className="card span4 skeleton"><div className="skeleton line long" /></section>
      <section className="card span4 skeleton"><div className="skeleton line long" /></section>
    </div>
  );
}

/** Dashboard body — all hooks run unconditionally, in the same order,
    on every render. Only rendered once hydrated is true. */
function DashboardBody() {
  const { data, dispatch, audit, notify } = useApp();
  const { user, canVisitPage } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>('month');
  const myId = user?.employeeId ?? '';

  /* -------- scoping -------- */
  const onRoll = useMemo(
    () => filterDemoEmployees(data.employees).filter((e) => e.status === 'Active' || e.status === 'Probation' || e.status === 'On Leave'),
    [data.employees],
  );
  const team = useMemo(() => {
    if (user?.portal !== 'manager' || !myId) return onRoll;
    const direct = new Set<string>();
    const collect = (managerId: string) => {
      filterDemoEmployees(data.employees).forEach((e) => {
        if (e.manager === managerId && !direct.has(e.id)) {
          direct.add(e.id);
          collect(e.id);
        }
      });
    };
    collect(myId);
    return onRoll.filter((e) => direct.has(e.id) || e.id === myId);
  }, [data.employees, onRoll, myId, user?.portal]);

  const scoped: Employee[] = self ? [] : team;

  const ctx = useMemo(
    () => ({ holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides }),
    [data.holidays, data.leaveRequests, data.attendanceOverrides],
  );

  /* -------- attendance series -------- */
  const seriesByRange = useMemo(() => {
    const allDays = lastWorkingDays(101).slice(0, -1); // drop today (in progress)
    const slices: Record<RangeKey, Date[]> = {
      month: allDays.slice(-20),
      last: allDays.slice(-40, -20),
      d90: allDays.slice(-60),
    };
    const employees = self ? data.employees.filter((e) => e.id === myId) : scoped;
    const out: Record<RangeKey, { dates: Date[]; present: number[]; wfh: number[] }> = {
      month: { dates: [], present: [], wfh: [] },
      last: { dates: [], present: [], wfh: [] },
      d90: { dates: [], present: [], wfh: [] },
    };
    (Object.keys(slices) as RangeKey[]).forEach((key) => {
      const { present, wfh } = seriesForDates(slices[key], employees, ctx);
      out[key] = { dates: slices[key], present, wfh };
    });
    return out;
  }, [ctx, scoped, self, data.employees, myId]);

  const chart = seriesByRange[range];
  const chartLabels = chart.dates.map((d) => shortDate(toISO(d)));
  const latestPresent = chart.present[chart.present.length - 1] ?? 0;
  const latestWfh = chart.wfh[chart.wfh.length - 1] ?? 0;

  /* -------- KPIs -------- */
  const pendingApprovals = useMemo(
    () =>
      data.leaveRequests.filter(
        (r) => r.status === 'Pending' && (self || scoped.length === 0 || scoped.some((e) => e.id === r.employeeId)),
      ),
    [data.leaveRequests, scoped, self],
  );

  const orgKpis = useMemo(() => {
    const today = todayISO();
    let presentToday = 0;
    let onLeaveToday = 0;
    scoped.forEach((e) => {
      const req = requestOn(data.leaveRequests, e.id, today);
      if (req && req.status === 'Approved') {
        if (req.type === 'Work From Home') presentToday++;
        else {
          onLeaveToday++;
          return;
        }
      }
      const att = attendanceOn(e.id, today, ctx) ?? undefined;
      if (!att) presentToday++; // today is still in progress — assume present unless leave
    });
    const joinsThisMonth = scoped.filter((e) => sameMonth(e.joining, today.slice(0, 7))).length;
    const attendancePct = dayAttendancePct(toISO(lastWorkingDays(1)[0]), scoped, ctx);
    const wfhToday = scoped.filter((e) => {
      const req = requestOn(data.leaveRequests, e.id, today);
      return (attendanceOn(e.id, today, ctx)?.status === 'wfh') || (req && req.status === 'Approved' && req.type === 'Work From Home');
    }).length;
    return { presentToday, onLeaveToday, joinsThisMonth, attendancePct, wfhToday };
  }, [scoped, data.leaveRequests, ctx]);

  const mySummary = useMemo(() => {
    const now = new Date();
    return monthSummary(myId, now.getFullYear(), now.getMonth(), ctx);
  }, [myId, ctx]);
  const myPending = data.leaveRequests.filter((r) => r.employeeId === myId && r.status === 'Pending').length;

  /* -------- department mix -------- */
  const deptData = useMemo(
    () =>
      data.departments
        .map((dept, i) => ({
          label: dept.name,
          value: scoped.filter((e) => e.dept === dept.id).length,
          color: DEPT_COLORS[i % DEPT_COLORS.length],
        }))
        .filter((d) => d.value > 0),
    [data.departments, scoped],
  );

  /* -------- leave table -------- */
  const leaveRows = useMemo(
    () =>
      data.leaveRequests
        .filter((r) => (self ? r.employeeId === myId : scoped.some((e) => e.id === r.employeeId)))
        .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1))
        .slice(0, 6),
    [data.leaveRequests, scoped, self, myId],
  );

  const decide = (req: LeaveRequest, approve: boolean) => {
    dispatch({
      type: 'update',
      collection: 'leaveRequests',
      id: req.id,
      patch: { status: approve ? 'Approved' : 'Rejected', decidedAt: new Date().toISOString() },
    });
    const emp = data.employees.find((e) => e.id === req.employeeId);
    audit(`Leave ${approve ? 'approved' : 'rejected'}`, req.id);
    notify(`Leave ${req.id} for ${emp?.name ?? req.employeeId} was ${approve ? 'approved' : 'rejected'}`);
    toast(`Leave ${approve ? 'approved' : 'rejected'} for ${emp?.name ?? 'employee'}.`, approve ? 'success' : 'info');
  };

  /* -------- payroll snapshot -------- */
  const currentRun = data.payrollRuns[data.payrollRuns.length - 1];
  const payrollNet = currentRun?.rows.reduce((sum, r) => sum + r.net, 0) ?? 0;
  const payrollPaid = currentRun?.rows.filter((r) => r.payStatus === 'Paid').length ?? 0;

  /* ============================================================
     Render
     ============================================================ */
  return (
    <div className="grid">
      {/* ---------- Today's check-in — employee self-service only, so the
           HR / Manager dashboards keep their existing layout ---------- */}
      {self ? <CheckInCard /> : null}

      {/* ---------- Row 1 : KPIs ---------- */}
      {self ? (
        <>
          <KpiCard
            label="My attendance"
            value={mySummary.pct === null ? '—' : `${mySummary.pct}%`}
            delta={`${mySummary.present} present · ${mySummary.wfh} WFH this month`}
            deltaColor="var(--green)"
            icon="userCheck"
            color="var(--green)"
            tint="var(--green-tint)"
            onClick={() => navigate(PAGE_PATH.Attendance)}
          />
          <KpiCard
            label="Leave balance"
            value={data.leaveBalance.total - data.leaveBalance.used}
            delta={`${data.leaveBalance.used} used of ${data.leaveBalance.total}`}
            deltaColor="var(--text-2)"
            icon="calendar"
            color="var(--amber)"
            tint="var(--amber-tint)"
            onClick={() => navigate(PAGE_PATH.Leave)}
          />
          <KpiCard
            label="Pending requests"
            value={myPending}
            delta={myPending ? 'Awaiting approval' : 'All clear'}
            deltaColor={myPending ? 'var(--amber)' : 'var(--green)'}
            icon="clipboardCheck"
            color="var(--violet)"
            tint="var(--violet-tint)"
            onClick={() => navigate(PAGE_PATH.Leave)}
          />
          <KpiCard
            label="Half days / leave"
            value={`${mySummary.half} / ${mySummary.leave}`}
            delta={`${mySummary.absent} absent this month`}
            deltaColor={mySummary.absent ? 'var(--red)' : 'var(--text-2)'}
            icon="clock"
            color="var(--blue)"
            tint="var(--blue-tint)"
            onClick={() => navigate(PAGE_PATH.Attendance)}
          />
        </>
      ) : (
        <>
          <KpiCard
            label={user?.portal === 'manager' ? 'Team size' : 'Total Employees'}
            value={scoped.length}
            delta={`+${orgKpis.joinsThisMonth} joined this month`}
            deltaColor="var(--green)"
            icon="users"
            color="var(--teal)"
            tint="var(--teal-tint)"
            onClick={() => navigate(PAGE_PATH.Employees)}
          />
          <KpiCard
            label="Present today"
            value={orgKpis.presentToday}
            delta={`${orgKpis.attendancePct ?? 0}% attendance · ${orgKpis.wfhToday} WFH`}
            deltaColor="var(--green)"
            icon="userCheck"
            color="var(--green)"
            tint="var(--green-tint)"
            onClick={() => navigate(PAGE_PATH.Attendance)}
          />
          <KpiCard
            label="On leave today"
            value={orgKpis.onLeaveToday}
            delta={`${pct(orgKpis.onLeaveToday, Math.max(1, scoped.length))}% of the workforce`}
            deltaColor="var(--text-2)"
            icon="calendar"
            color="var(--amber)"
            tint="var(--amber-tint)"
            onClick={() => navigate(PAGE_PATH.Leave)}
          />
          <KpiCard
            label="Pending approvals"
            value={pendingApprovals.length}
            delta={pendingApprovals.length ? 'Action required' : 'All caught up'}
            deltaColor={pendingApprovals.length ? 'var(--amber)' : 'var(--green)'}
            icon="clipboardCheck"
            color="var(--violet)"
            tint="var(--violet-tint)"
            onClick={() => navigate(canVisitPage('Leave Approvals') ? PAGE_PATH['Leave Approvals'] : PAGE_PATH.Leave)}
          />
        </>
      )}

      {/* ---------- Row 2 : attendance + donut ---------- */}
      <section className="card span8 attendance-card" aria-labelledby="attTrendH">
        <div className="card-head">
          <div>
            <h2 id="attTrendH">{self ? 'My attendance trend' : 'Attendance trend'}</h2>
            <div className="sub">Present and work-from-home counts per working day</div>
          </div>
          <div className="pills">
            {(
              [
                ['month', 'This month'],
                ['last', 'Last month'],
                ['d90', '90 days'],
              ] as Array<[RangeKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                className={`pill${range === key ? ' active' : ''}`}
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="legend">
          <span>
            <span className="dot" style={{ background: 'var(--teal)' }} />
            Present
          </span>
          <span>
            <span className="dot" style={{ background: 'var(--violet)' }} />
            Work from home
          </span>
        </div>
        <LineChart
          labels={chartLabels}
          series={[
            { name: 'Present', color: 'var(--teal)', values: chart.present },
            { name: 'Work from home', color: 'var(--violet)', values: chart.wfh },
          ]}
          srSummary={`Attendance trend. Latest day: ${latestPresent} present, ${latestWfh} working from home.`}
        />
        <div className="card-foot">
          Latest working day: {latestPresent} present · {latestWfh} WFH
        </div>
      </section>

      <section className="card span4 dept-card">
        <div className="card-head">
          <div>
            <h2>{self ? 'My department mix' : 'Headcount by department'}</h2>
            <div className="sub">Open a slice to filter the directory</div>
          </div>
        </div>
        <DonutChart
          data={deptData}
          centerLabel={self ? 'Team' : 'Employees'}
          onSelect={(d) =>
            !self &&
            navigate(PAGE_PATH.Employees, { state: { dept: data.departments.find((x) => x.name === d.label)?.id } })
          }
        />
      </section>

      {/* ---------- Row 3 : leave + funnel / events ---------- */}
      <section className="card span7" aria-labelledby="leaveDashH">
        <div className="card-head">
          <div>
            <h2 id="leaveDashH">{self ? 'My recent leave requests' : 'Leave requests'}</h2>
            <div className="sub">Latest applications{self ? '' : ' across your scope'}</div>
          </div>
          <button className="link" onClick={() => navigate(canVisitPage('Leave Approvals') ? PAGE_PATH['Leave Approvals'] : PAGE_PATH.Leave)} type="button">
            View all
          </button>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {leaveRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">No leave requests to show.</div>
                  </td>
                </tr>
              ) : (
                leaveRows.map((r) => {
                  const emp = data.employees.find((e) => e.id === r.employeeId);
                  return (
                    <tr key={r.id}>
                      <td>
                        <EmpCell name={emp?.name ?? r.employeeId} sub={emp?.designation ?? ''} seed={r.employeeId} />
                      </td>
                      <td>{r.type}</td>
                      <td className="num">{dateRange(r.from, r.to)}</td>
                      <td className="num">{r.days}</td>
                      <td>
                        <Pill status={r.status} />
                      </td>
                      <td>
                        {r.status === 'Pending' && !self && canVisitPage('Leave Approvals') ? (
                          <div className="act-btns">
                            <button className="btn btn-outline btn-sm" onClick={() => decide(r, true)} type="button">
                              Approve
                            </button>
                            <button className="btn btn-danger-outline btn-sm" onClick={() => decide(r, false)} type="button">
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {self ? (
        <section className="card span5">
          <div className="card-head">
            <div>
              <h2>My month at a glance</h2>
              <div className="sub">{niceDate(`${todayISO().slice(0, 7)}-01`).slice(3)}</div>
            </div>
          </div>
          <div className="cal-statgrid">
            <span className="stat">
              Present <b>{mySummary.present}</b>
            </span>
            <span className="stat">
              WFH <b>{mySummary.wfh}</b>
            </span>
            <span className="stat">
              Half days <b>{mySummary.half}</b>
            </span>
            <span className="stat">
              Leave <b>{mySummary.leave}</b>
            </span>
            <span className="stat">
              Absent <b>{mySummary.absent}</b>
            </span>
            <span className="stat">
              Working days <b>{mySummary.working}</b>
            </span>
          </div>
          <Progress
            label="Attendance rate"
            value={mySummary.pct ?? 0}
          />
          <button className="btn btn-outline btn-sm" onClick={() => navigate(PAGE_PATH.Leave)} type="button">
            Apply for leave
          </button>
        </section>
      ) : (
        <section className="card span5">
          <div className="card-head">
            <div>
              <h2>Recruitment funnel</h2>
              <div className="sub">Applied → joined conversion</div>
            </div>
          </div>
          <Funnel
            stages={data.funnel}
            onSelect={() => canVisitPage('Recruitment') && navigate(PAGE_PATH.Recruitment)}
          />
          <div className="card-foot">
            {data.candidates.length} candidates in pipeline ·{' '}
            {pct(data.funnel[data.funnel.length - 1]?.count ?? 0, data.funnel[0]?.count ?? 1)}% conversion
          </div>
        </section>
      )}

      {/* ---------- Row 4 ---------- */}
      {!self ? (
        <section className="card span4 payroll-card">
          <div className="card-head">
            <div>
              <h2>Payroll</h2>
              <div className="sub">{currentRun ? currentRun.period : 'No run yet'}</div>
            </div>
          </div>
          {currentRun ? (
            <>
              <div className="big">{moneyCompact(payrollNet)}</div>
              <div className="big-label">Net payout for {currentRun.rows.length} employees</div>
              <div className="pay-stats">
                <div>
                  <b>
                    {payrollPaid}/{currentRun.rows.length}
                  </b>
                  <span>Paid</span>
                </div>
                <div>
                  <b>{currentRun.status}</b>
                  <span>Status</span>
                </div>
              </div>
              <div className="pay-date">Pay date: {niceDate(currentRun.payDate)}</div>
            </>
          ) : (
            <>
              <div className="big">—</div>
              <div className="big-label">No payroll run for this period</div>
              <div className="pay-date">Start a run from Payroll → Processing.</div>
            </>
          )}
          {canVisitPage('Payroll') ? (
            <button className="btn btn-primary btn-sm" onClick={() => navigate(PAGE_PATH.Payroll)} type="button">
              {currentRun ? 'Open payroll' : 'Run payroll'}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="card span4">
        <div className="card-head">
          <div>
            <h2>Upcoming</h2>
            <div className="sub">Events, pay days and reviews</div>
          </div>
        </div>
        {data.events.map((e, i) => (
          <div className="event" key={`${e.title}-${i}`}>
            <span className="date-chip">
              <b>{e.day}</b>
              <span>{e.month}</span>
            </span>
            <span className="what">
              <b>{e.title}</b>
              <span>{e.detail}</span>
            </span>
          </div>
        ))}
      </section>

      <section className="card span4">
        <div className="card-head">
          <div>
            <h2>Announcements</h2>
            <div className="sub">From the notice board</div>
          </div>
          {canVisitPage('Notice Board') ? (
            <button className="btn btn-outline btn-sm" onClick={() => navigate(PAGE_PATH['Notice Board'])} type="button">
              Open
            </button>
          ) : null}
        </div>
        {data.announcements.slice(0, 3).map((a) => (
          <div className="ann" key={a.id}>
            <b>{a.title}</b>
            <p>{a.body}</p>
            <span className="meta">
              {a.author} · {niceDate(a.date)}
            </span>
          </div>
        ))}
      </section>

      <section className="card span4">
        <div className="card-head">
          <div>
            <h2>Leave balance</h2>
            <div className="sub">Effective this year</div>
          </div>
        </div>
        <div className="cal-statgrid">
          <span className="stat">
            Casual <b>{data.leaveBalance.casual}</b>
          </span>
          <span className="stat">
            Sick <b>{data.leaveBalance.sick}</b>
          </span>
          <span className="stat">
            Paid / Earned <b>{data.leaveBalance.paidEarned}</b>
          </span>
          <span className="stat">
            Used <b>{data.leaveBalance.used}</b>
          </span>
        </div>
        <Progress label="Balance used" value={clampPct((data.leaveBalance.used / Math.max(1, data.leaveBalance.total)) * 100)} />
        <div className="info-note">
          Attendance %, balances and payslips update from the same roster — nothing here is hard-coded.
        </div>
      </section>

      {canSeeSalary(user?.role ?? 'EMPLOYEE') && !self ? (
        <section className="card span12">
          <div className="card-head">
            <div>
              <h2>Today at a glance</h2>
              <div className="sub">Attendance legend used across the portal</div>
            </div>
          </div>
          <div className="cal-legend" style={{ borderBottom: 'none', marginBottom: 0 }}>
            {Object.entries(ATTENDANCE_META).map(([key, meta]) => (
              <span className="li" key={key}>
                <span className="cal-dot" style={{ background: meta.color }} />
                {meta.label}
              </span>
            ))}
            {Object.entries(LEAVE_TYPE_COLORS)
              .slice(0, 4)
              .map(([type, color]) => (
                <span className="li" key={type}>
                  <span className="cal-dot" style={{ background: color }} />
                  {type}
                </span>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ---------------- KPI card ---------------- */
function KpiCard({
  label,
  value,
  delta,
  deltaColor,
  icon,
  color,
  tint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  delta: string;
  deltaColor: string;
  icon: string;
  color: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button className="card kpi span3" onClick={onClick} aria-label={`${label}: ${String(value)}`} type="button">
      <span style={{ minWidth: 0, textAlign: 'left' }}>
        <span className="label">{label}</span>
        <span className="value">{value}</span>
        <span className="delta" style={{ color: deltaColor }}>
          {delta}
        </span>
      </span>
      <span className="chipbox" style={{ background: tint, color }}>
        <Icon name={icon} size={20} />
      </span>
    </button>
  );
}

