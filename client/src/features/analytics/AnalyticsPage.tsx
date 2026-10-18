/* ============================================================
   Analytics — the company view: filters, KPIs, charts and a
   drill-down detail table. Everything derives from the roster.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BarList, type BarItem } from '@/components/charts/BarList';
import { DonutChart } from '@/components/charts/DonutChart';
import { Funnel } from '@/components/charts/Funnel';
import { LineChart } from '@/components/charts/LineChart';
import { Pill } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/context/ToastContext';
import { deptName } from '@/lib/lookups';
import { LEAVE_TYPE_COLORS, monthSummary, seriesForDates } from '@/lib/attendance';
import { lastMonths, lastWorkingDays, niceDate, sameMonth, shortDate, todayISO, toISO, yearsSince } from '@/lib/date';
import { downloadCsv, rowsToCsv } from '@/lib/csv';
import { moneyCompact, pct } from '@/lib/format';
import type { AttendanceContext } from '@/lib/attendance';

const DEPT_COLORS = ['#7FD4C1', '#8B5CF6', '#F97316', '#3B82F6', '#22C55E', '#F59E0B'];
const BAR_COLORS = ['#7FD4C1', '#8B5CF6', '#F59E0B', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#509888'];

type PeriodKey = 'month' | 'q' | 'hy' | 'year';

const PERIOD_LABEL: Record<PeriodKey, string> = {
  month: 'This month',
  q: 'Last 3 months',
  hy: 'Last 6 months',
  year: 'This year',
};

function windowFor(period: PeriodKey) {
  if (period === 'month') return lastMonths(1);
  if (period === 'q') return lastMonths(3);
  if (period === 'hy') return lastMonths(6);
  const year = new Date().getFullYear();
  return lastMonths(12).filter((m) => m.y === year);
}

export function AnalyticsPage() {
  const { data } = useApp();
  const { toast } = useToast();

  const [period, setPeriod] = useState<PeriodKey>('q');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('all');
  const [drill, setDrill] = useState('');

  const months = useMemo(() => windowFor(period), [period]);
  const ctx: AttendanceContext = useMemo(
    () => ({ holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides }),
    [data.holidays, data.leaveRequests, data.attendanceOverrides],
  );

  /* -------- aggregate attendance across the window -------- */
  const attendanceOf = useMemo(() => {
    return (employeeId: string) => {
      let present = 0;
      let wfh = 0;
      let half = 0;
      let leave = 0;
      let elapsed = 0;
      let working = 0;
      months.forEach((m) => {
        const s = monthSummary(employeeId, m.y, m.m, ctx);
        present += s.present;
        wfh += s.wfh;
        half += s.half;
        leave += s.leave;
        elapsed += s.elapsed;
        working += s.working;
      });
      const payable = elapsed - leave;
      const rate = payable > 0 ? Math.round(((present + wfh + half * 0.5) / payable) * 100) : null;
      return { present, wfh, half, leave, elapsed, working, rate };
    };
  }, [months, ctx]);

  /* -------- scoped employees -------- */
  const scoped = useMemo(() => {
    let list = data.employees;
    if (dept !== 'all') list = list.filter((e) => e.dept === dept);
    if (status !== 'all') list = list.filter((e) => e.status === status);
    return list;
  }, [data.employees, dept, status]);

  const onRoll = scoped.filter((e) => e.status !== 'Resigned' && e.status !== 'Terminated');

  /* -------- leave in window -------- */
  const leaveInWindow = useMemo(() => {
    const keys = new Set(months.map((m) => m.key));
    return data.leaveRequests.filter(
      (r) => r.status === 'Approved' && (keys.has(r.from.slice(0, 7)) || keys.has(r.to.slice(0, 7))),
    );
  }, [data.leaveRequests, months]);

  const leaveDays = leaveInWindow.reduce((s, r) => s + r.days, 0);

  /* -------- KPIs -------- */
  const kpis = useMemo(() => {
    const rates = onRoll.map((e) => attendanceOf(e.id).rate).filter((r): r is number => r !== null);
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    const reviews = data.reviews.filter((r) => onRoll.some((e) => e.id === r.employeeId));
    const avgScore = reviews.length ? Math.round(reviews.reduce((s, r) => s + r.score, 0) / reviews.length) : 0;
    const joiners = onRoll.filter((e) => months.some((m) => sameMonth(e.joining, m.key))).length;
    const openPositions = data.jobs.filter((j) => j.status === 'Open' || j.status === 'Published').reduce((s, j) => s + j.vacancies, 0);
    const avgTenure = onRoll.length
      ? Math.round((onRoll.reduce((s, e) => s + yearsSince(e.joining), 0) / onRoll.length) * 10) / 10
      : 0;
    const latestRun = data.payrollRuns.slice().sort((a, b) => (a.period < b.period ? 1 : -1))[0];
    const payrollCost = latestRun
      ? latestRun.rows.filter((r) => onRoll.some((e) => e.id === r.empId)).reduce((s, r) => s + r.net, 0)
      : 0;
    return { avgRate, avgScore, joiners, openPositions, avgTenure, payrollCost };
  }, [onRoll, attendanceOf, data.reviews, data.jobs, data.payrollRuns, months]);

  /* -------- charts -------- */
  const deptBars = useMemo<BarItem[]>(
    () =>
      data.departments
        .map((d) => ({
          key: d.id,
          label: d.name,
          value: data.employees.filter((e) => e.dept === d.id && (status === 'all' || e.status === status)).length,
          color: DEPT_COLORS[data.departments.indexOf(d) % DEPT_COLORS.length],
        }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value),
    [data.departments, data.employees, status],
  );

  const trend = useMemo(() => {
    const dates = lastWorkingDays(21).slice(0, -1);
    const { present, wfh } = seriesForDates(dates, onRoll, ctx);
    return { labels: dates.map((d) => shortDate(toISO(d))), present, wfh };
  }, [onRoll, ctx]);

  const leaveBars = useMemo<BarItem[]>(() => {
    const byType = new Map<string, number>();
    leaveInWindow.forEach((r) => byType.set(r.type, (byType.get(r.type) ?? 0) + r.days));
    return Array.from(byType.entries())
      .map(([type, days], i) => ({
        key: type,
        label: type,
        value: days,
        color: LEAVE_TYPE_COLORS[type] ?? BAR_COLORS[i % BAR_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [leaveInWindow]);

  const hiringBars = useMemo<BarItem[]>(
    () =>
      months
        .map((m) => ({
          key: m.key,
          label: `${m.label} ${m.y}`,
          value: data.employees.filter((e) => sameMonth(e.joining, m.key)).length,
          color: '#7FD4C1',
        }))
        .reverse(),
    [months, data.employees],
  );

  const donut = useMemo(
    () =>
      data.departments
        .map((d, i) => ({
          label: d.name,
          value: data.employees.filter((e) => e.dept === d.id).length,
          color: DEPT_COLORS[i % DEPT_COLORS.length],
        }))
        .filter((s) => s.value > 0),
    [data.departments, data.employees],
  );

  /* -------- drill detail table -------- */
  const detailRows = useMemo(() => {
    let list = scoped;
    if (drill) list = list.filter((e) => e.dept === drill);
    return list
      .map((e) => {
        const att = attendanceOf(e.id);
        const empLeave = leaveInWindow.filter((r) => r.employeeId === e.id).reduce((s, r) => s + r.days, 0);
        return { employee: e, att, empLeave };
      })
      .sort((a, b) => (a.employee.name < b.employee.name ? -1 : 1));
  }, [scoped, drill, attendanceOf, leaveInWindow]);

  const exportCsv = () => {
    const rows = detailRows.map(({ employee: e, att, empLeave }) => [
      e.name,
      e.id,
      deptName(data.departments, e.dept),
      e.designation,
      e.status,
      niceDate(e.joining),
      att.rate === null ? '—' : `${att.rate}%`,
      empLeave,
    ]);
    downloadCsv(
      `cyethack_analytics_${period}_${todayISO()}`,
      rowsToCsv([['Employee', 'ID', 'Department', 'Designation', 'Status', 'Joined', 'Attendance %', 'Leave days'], ...rows]),
    );
    toast('Analytics detail exported to CSV.', 'success');
  };

  const drillName = drill ? deptName(data.departments, drill) : '';
  const activeDept = dept !== 'all' ? dept : drill;

  return (
    <div className="grid">
      <section className="card span12">
        <div className="ana-head">
          <div>
            <h2>People Analytics</h2>
            <div className="sub">
              {PERIOD_LABEL[period]} · {dept === 'all' ? 'all departments' : deptName(data.departments, dept)} ·{' '}
              {status === 'all' ? 'all statuses' : status}
            </div>
          </div>
          <div className="tools no-print">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setDept('all');
                setStatus('all');
                setDrill('');
              }}
              type="button"
            >
              <Icon name="refresh" size={14} /> Reset filters
            </button>
            <button className="btn btn-outline btn-sm" onClick={exportCsv} type="button">
              <Icon name="download" size={14} /> Export CSV
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()} type="button">
              <Icon name="printer" size={14} /> Print
            </button>
          </div>
        </div>

        <div className="ana-filters no-print">
          <div className="f">
            <label htmlFor="ana-dept">Department</label>
            <select id="ana-dept" value={dept} onChange={(e) => { setDept(e.target.value); setDrill(''); }}>
              <option value="all">All departments</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="ana-period">Period</label>
            <select id="ana-period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
              {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
                <option key={k} value={k}>
                  {PERIOD_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="ana-status">Employee status</label>
            <select id="ana-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {['Active', 'Probation', 'On Leave', 'Resigned', 'Terminated'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {drill ? (
            <span className="ana-drill-note">
              Drilled into {drillName}
              <button onClick={() => setDrill('')} type="button" aria-label="Clear drill">
                ✕
              </button>
            </span>
          ) : null}
        </div>

        <div className="ana-kpis">
          <div className="ana-kpi">
            <div className="v">{onRoll.length}</div>
            <div className="l">Employees in scope</div>
            <div className="d" style={{ color: 'var(--green)' }}>+{kpis.joiners} joined in period</div>
          </div>
          <div className="ana-kpi">
            <div className="v">{kpis.avgRate}%</div>
            <div className="l">Average attendance</div>
            <div className="d" style={{ color: kpis.avgRate >= 85 ? 'var(--green)' : 'var(--amber)' }}>
              Leave excluded from denominator
            </div>
          </div>
          <div className="ana-kpi">
            <div className="v">{leaveDays}</div>
            <div className="l">Leave days taken</div>
            <div className="d" style={{ color: 'var(--text-2)' }}>
              {leaveInWindow.length} approved requests
            </div>
          </div>
          <div className="ana-kpi">
            <div className="v">{kpis.avgScore || '—'}</div>
            <div className="l">Average review score</div>
            <div className="d" style={{ color: 'var(--text-2)' }}>Latest cycles</div>
          </div>
          <div className="ana-kpi">
            <div className="v">{kpis.openPositions}</div>
            <div className="l">Open positions</div>
            <div className="d" style={{ color: 'var(--amber)' }}>{data.candidates.length} candidates in pipeline</div>
          </div>
          <div className="ana-kpi">
            <div className="v">{kpis.avgTenure}y</div>
            <div className="l">Average tenure</div>
            <div className="d" style={{ color: 'var(--text-2)' }}>Across the scoped roster</div>
          </div>
          <div className="ana-kpi">
            <div className="v">{moneyCompact(kpis.payrollCost)}</div>
            <div className="l">Monthly payroll cost</div>
            <div className="d" style={{ color: 'var(--text-2)' }}>Latest processed run · net</div>
          </div>
        </div>

        <div className="ana-grid2">
          <div className="chart-card">
            <h3>Headcount by department</h3>
            <div className="sub">Click a bar to drill into the detail below</div>
            <BarList
              items={deptBars}
              onSelect={(item) => setDrill(drill === item.key ? '' : item.key)}
              isActive={(item) => activeDept === item.key}
            />
          </div>
          <div className="chart-card">
            <h3>Attendance trend</h3>
            <div className="sub">Present and work-from-home per working day (last 20)</div>
            <LineChart
              labels={trend.labels}
              series={[
                { name: 'Present', color: '#7FD4C1', values: trend.present },
                { name: 'Work from home', color: '#8B5CF6', values: trend.wfh },
              ]}
              srSummary={`Attendance trend over the last 20 working days for ${onRoll.length} employees.`}
            />
          </div>
        </div>

        <div className="ana-grid2">
          <div className="chart-card">
            <h3>Leave days by type</h3>
            <div className="sub">Approved requests in the selected period</div>
            {leaveBars.length ? <BarList items={leaveBars} /> : <div className="empty">No approved leave in this period.</div>}
          </div>
          <div className="chart-card">
            <h3>Hiring trend</h3>
            <div className="sub">Joiners per month</div>
            <BarList items={hiringBars} />
          </div>
        </div>

        <div className="ana-grid2">
          <div className="chart-card">
            <h3>Workforce mix</h3>
            <div className="sub">Share of the company by department</div>
            <DonutChart
              data={donut}
              centerLabel="Employees"
              onSelect={(slice) => {
                const d = data.departments.find((x) => x.name === slice.label);
                if (d) setDrill(drill === d.id ? '' : d.id);
              }}
            />
          </div>
          <div className="chart-card">
            <h3>Recruitment funnel</h3>
            <div className="sub">Applied → joined, company-wide</div>
            <Funnel stages={data.funnel} />
          </div>
        </div>

        <div className="ana-head" style={{ marginTop: 8 }}>
          <div>
            <h2>Detail — {activeDept ? deptName(data.departments, activeDept) : 'all departments'}</h2>
            <div className="sub">
              {detailRows.length} employees · attendance rate over {months.length} month{months.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Attendance %</th>
                <th>Leave days</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map(({ employee: e, att, empLeave }) => (
                <tr key={e.id}>
                  <td>
                    <b>{e.name}</b>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{e.id}</span>
                  </td>
                  <td>{deptName(data.departments, e.dept)}</td>
                  <td>{e.designation}</td>
                  <td>
                    <Pill status={e.status} />
                  </td>
                  <td className="num">{niceDate(e.joining)}</td>
                  <td className="num">{att.rate === null ? '—' : `${att.rate}%`}</td>
                  <td className="num">{empLeave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-foot">
          {pct(onRoll.length, Math.max(1, data.employees.length))}% of the company in scope · reporting window{' '}
          {months.length ? `${months[0].label} – ${months[months.length - 1].label} ${months[0].y}` : '—'}
        </div>
      </section>
    </div>
  );
}
