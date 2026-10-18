/* ============================================================
   Reports — a small report engine over the same store.

   Each report is data → table, so CSV export and printing come
   for free, and the activity log doubles as an audit trail.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { deptName, empName } from '@/lib/lookups';
import { downloadCsv, rowsToCsv } from '@/lib/csv';
import { niceDate, todayISO } from '@/lib/date';
import { accuracyText, capturedText, coordText } from '@/lib/geo';
import { money, moneyCompact, pct } from '@/lib/format';
import { ATTENDANCE_META, monthSummary } from '@/lib/attendance';
import type { AppData } from '@/types';

interface ReportDef {
  key: string;
  icon: string;
  title: string;
  desc: string;
}

interface ReportTable {
  head: string[];
  rows: Array<Array<string | number>>;
  note: string;
}

const REPORTS: ReportDef[] = [
  { key: 'directory', icon: 'users', title: 'Employee Directory', desc: 'Full roster with departments and reporting lines' },
  { key: 'headcount', icon: 'building', title: 'Department Headcount', desc: 'Headcount and budget per department' },
  { key: 'attendance', icon: 'userCheck', title: 'Attendance Summary', desc: 'Current-month attendance rate per employee' },
  { key: 'leave', icon: 'calendar', title: 'Leave Register', desc: 'Every request with its approval status' },
  { key: 'payroll', icon: 'banknote', title: 'Payroll Register', desc: 'Latest run with earnings and deductions' },
  { key: 'recruitment', icon: 'briefcase', title: 'Recruitment Pipeline', desc: 'Candidates by stage and source' },
  { key: 'projects', icon: 'folderKanban', title: 'Project Status', desc: 'Delivery portfolio with progress' },
  { key: 'performance', icon: 'trendingUp', title: 'Performance Snapshot', desc: 'Scores, ratings and KPI completion' },
  { key: 'locations', icon: 'mapPin', title: 'Sign-in & Location Log', desc: 'GPS captures recorded at sign-ins and attendance check-ins' },
];

function buildReport(key: string, data: AppData, ctx: { holidays: AppData['holidays']; leaveRequests: AppData['leaveRequests']; overrides: AppData['attendanceOverrides'] }, canSeeSalary: boolean): ReportTable {
  const now = new Date();
  switch (key) {
    case 'directory': {
      const head = ['Employee', 'ID', 'Department', 'Designation', 'Manager', 'Location', 'Type', 'Joined', 'Status'];
      if (canSeeSalary) head.push('Monthly in-hand');
      const rows = data.employees
        .slice()
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((e) => {
          const row: Array<string | number> = [
            e.name,
            e.id,
            deptName(data.departments, e.dept),
            e.designation,
            empName(data.employees, e.manager),
            e.location,
            e.employmentType,
            niceDate(e.joining),
            e.status,
          ];
          if (canSeeSalary) row.push(money(e.salary));
          return row;
        });
      return { head, rows, note: `${rows.length} employees on the roster.` };
    }
    case 'headcount': {
      const rows = data.departments.map((d) => [
        d.name,
        empName(data.employees, d.head),
        data.employees.filter((e) => e.dept === d.id && e.status !== 'Resigned' && e.status !== 'Terminated').length,
        d.budget,
        d.active ? 'Active' : 'Inactive',
      ]);
      return {
        head: ['Department', 'Head', 'Headcount', 'Annual budget', 'Status'],
        rows,
        note: `Across ${data.departments.length} departments.`,
      };
    }
    case 'attendance': {
      const rows = data.employees.map((e) => {
        const s = monthSummary(e.id, now.getFullYear(), now.getMonth(), ctx);
        return [
          e.name,
          deptName(data.departments, e.dept),
          s.present,
          s.wfh,
          s.half,
          s.leave,
          s.absent,
          s.working,
          s.pct === null ? '—' : `${s.pct}%`,
        ];
      });
      return {
        head: ['Employee', 'Department', 'Present', 'WFH', 'Half days', 'Leave', 'Absent', 'Working days', 'Attendance %'],
        rows,
        note: `Current month (${todayISO().slice(0, 7)}) · leave excluded from the attendance denominator.`,
      };
    }
    case 'leave': {
      const rows = data.leaveRequests
        .slice()
        .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1))
        .map((r) => [
          r.id,
          empName(data.employees, r.employeeId),
          r.type,
          `${niceDate(r.from)}${r.to !== r.from ? ` – ${niceDate(r.to)}` : ''}`,
          r.days,
          r.halfDay ? 'Half day' : 'Full day',
          r.status,
          niceDate(r.appliedOn),
        ]);
      const byStatus = (s: string) => data.leaveRequests.filter((r) => r.status === s).length;
      return {
        head: ['Request', 'Employee', 'Type', 'Dates', 'Days', 'Kind', 'Status', 'Applied'],
        rows,
        note: `${rows.length} requests · ${byStatus('Pending')} pending · ${byStatus('Approved')} approved · ${byStatus('Rejected')} rejected.`,
      };
    }
    case 'payroll': {
      const run = data.payrollRuns.slice().sort((a, b) => (a.period < b.period ? 1 : -1))[0];
      if (!run) return { head: ['Period', 'Status'], rows: [], note: 'No payroll run has been created yet.' };
      const rows = run.rows.map((r) => {
        const e = data.employees.find((x) => x.id === r.empId);
        return [
          e?.name ?? r.empId,
          deptName(data.departments, e?.dept),
          r.basic,
          r.hra,
          r.conv,
          r.special,
          r.bonus,
          r.gross,
          r.pt,
          r.otherDed,
          r.net,
          r.payStatus,
        ];
      });
      const net = run.rows.reduce((s, r) => s + r.net, 0);
      return {
        head: ['Employee', 'Department', 'Basic', 'HRA', 'Conveyance', 'Special', 'Bonus', 'Gross', 'PT', 'Other deductions', 'Net pay', 'Status'],
        rows,
        note: `${run.id} · ${run.period} · ${run.status} · net payout ${money(net)}.`,
      };
    }
    case 'recruitment': {
      const rows = data.candidates.map((c) => [
        c.name,
        data.jobs.find((j) => j.id === c.jobId)?.title ?? c.jobId,
        c.stage,
        c.source,
        c.experience,
        niceDate(c.applied),
        empName(data.employees, c.recruiter),
      ]);
      const openJobs = data.jobs.filter((j) => j.status === 'Open' || j.status === 'Published').length;
      return {
        head: ['Candidate', 'Applied for', 'Stage', 'Source', 'Experience', 'Applied on', 'Recruiter'],
        rows,
        note: `${rows.length} candidates · ${openJobs} open roles.`,
      };
    }
    case 'projects': {
      const rows = data.projects.map((p) => [
        p.name,
        p.client,
        deptName(data.departments, p.dept),
        empName(data.employees, p.manager),
        p.status,
        p.priority,
        `${p.progress}%`,
        `${niceDate(p.start)} – ${niceDate(p.end)}`,
      ]);
      return {
        head: ['Project', 'Client', 'Department', 'Lead', 'Status', 'Priority', 'Progress', 'Timeline'],
        rows,
        note: `${rows.length} projects · ${data.tasks.length} tasks on the board.`,
      };
    }
    case 'performance': {
      const rows = data.reviews.map((r) => [
        empName(data.employees, r.employeeId),
        r.cycle,
        r.period,
        r.score,
        r.rating,
        empName(data.employees, r.manager),
      ]);
      const targets = data.targets.map((t) => [
        empName(data.employees, t.employeeId),
        t.name,
        `${t.achieved}/${t.target} ${t.unit}`,
        `${t.weightage}%`,
        t.status,
      ]);
      return {
        head: ['Employee', 'Cycle', 'Period', 'Score', 'Rating', 'Reviewer'],
        rows: [...rows, ...targets.map((t) => [`KPI · ${t[0]}`, '—', t[1], t[2], t[4], `Weightage ${t[3]}`])],
        note: `${data.reviews.length} reviews · ${data.targets.length} KPI targets.`,
      };
    }
    case 'locations': {
      const kindLabel = (k: string) => (k === 'login' ? 'Sign-in' : k === 'check-in' ? 'Check-in' : 'Check-out');
      const rows = data.locationLog
        .slice()
        .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))
        .map((l) => [
          l.employeeId ? empName(data.employees, l.employeeId) : l.email,
          kindLabel(l.kind),
          coordText(l),
          accuracyText(l),
          capturedText(l.capturedAt),
          l.ref,
        ]);
      return {
        head: ['Employee', 'Activity', 'Coordinates', 'Accuracy', 'Captured at', 'Reference'],
        rows,
        note: `${rows.length} GPS captures · stored only for sign-ins and check-ins, and only with browser permission.`,
      };
    }
    default:
      return { head: [], rows: [], note: '' };
  }
}

export function ReportsPage() {
  const { data } = useApp();
  const { canSeeSalary } = useAuth();
  const { toast } = useToast();
  const [active, setActive] = useState('directory');

  const ctx = useMemo(
    () => ({ holidays: data.holidays, leaveRequests: data.leaveRequests, overrides: data.attendanceOverrides }),
    [data.holidays, data.leaveRequests, data.attendanceOverrides],
  );

  const report = useMemo(
    () => buildReport(active, data, ctx, canSeeSalary),
    [active, data, ctx, canSeeSalary],
  );
  const def = REPORTS.find((r) => r.key === active);

  const exportCsv = () => {
    downloadCsv(`cyethack_${active}_report_${todayISO()}`, rowsToCsv([report.head, ...report.rows]));
    toast('Report exported to CSV.', 'success');
  };

  const stats = useMemo(() => {
    const onRoll = data.employees.filter((e) => e.status !== 'Resigned' && e.status !== 'Terminated').length;
    const payrollNet = data.payrollRuns
      .slice()
      .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
      ?.rows.reduce((s, r) => s + r.net, 0) ?? 0;
    return {
      employees: onRoll,
      departments: data.departments.length,
      leavePending: data.leaveRequests.filter((r) => r.status === 'Pending').length,
      payrollNet,
      attendance: ATTENDANCE_META.present.label,
    };
  }, [data]);

  return (
    <div className="grid">
      <section className="card span12 no-print">
        <div className="card-head">
          <div>
            <h2>Reports</h2>
            <div className="sub">Every report reads the live store — export to CSV or print to PDF</div>
          </div>
          <div className="tools">
            <span className="chip">{stats.employees} employees</span>
            <span className="chip">{stats.leavePending} pending leave</span>
            <span className="chip">Net payout {moneyCompact(stats.payrollNet)}</span>
          </div>
        </div>
        <div className="report-grid">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              className="report-card"
              style={{ borderColor: active === r.key ? 'var(--teal)' : undefined }}
              onClick={() => setActive(r.key)}
              type="button"
            >
              <span className="ic">
                <Icon name={r.icon} size={18} />
              </span>
              <b>{r.title}</b>
              <span>{r.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card span12">
        <div className="ana-head">
          <div>
            <h2>{def?.title ?? 'Report'}</h2>
            <div className="sub">{report.note}</div>
          </div>
          <div className="tools no-print">
            <button className="btn btn-outline btn-sm" onClick={exportCsv} type="button">
              <Icon name="download" size={14} /> Export CSV
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()} type="button">
              <Icon name="printer" size={14} /> Print / PDF
            </button>
          </div>
        </div>

        {report.rows.length === 0 ? (
          <div className="empty">This report has no rows yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  {report.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={typeof cell === 'number' || /^[₹\d]/.test(String(cell)) ? 'num' : undefined}>
                        {typeof cell === 'number' && report.head[j]?.includes('in-hand') ? money(cell) : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-foot">
          Generated {niceDate(todayISO())} · {report.rows.length} rows ·{' '}
          {pct(stats.employees, Math.max(1, data.employees.length))}% of the roster on roll
        </div>
      </section>

      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Activity & audit log</h2>
            <div className="sub">Every create, update, approval and export action recorded locally</div>
          </div>
          <span className="chip">{data.audit.length} entries</span>
        </div>
        {data.audit.length === 0 ? (
          <div className="empty">No activity recorded yet — actions across the portal will appear here.</div>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Record</th>
                  <th>User</th>
                  <th>Date</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Pill status={a.action.includes('approved') || a.action.includes('processed') ? 'Approved' : 'In Progress'} />
                      <span style={{ marginLeft: 8 }}>{a.action}</span>
                    </td>
                    <td className="num">{a.record || '—'}</td>
                    <td>{a.user}</td>
                    <td className="num">{niceDate(a.date)}</td>
                    <td className="num">{a.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
