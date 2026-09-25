/* Employee dashboard — PERSONAL data only. It is built from the employee's own
 * self-scoped records (leave, attendance, projects, performance); it never calls
 * the company reports/analytics endpoints (the API would refuse them anyway).
 * No company headcount, no other employees, no HR/manager aggregates. */
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { Card, StatCard, StatusPill, Spinner, EmptyState } from '../../components/ui';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api.get('/api/leaves'), api.get('/api/attendance'),
      api.get('/api/projects'), api.get('/api/performance')
    ]).then(([lv, at, pr, pf]) => {
      if (!alive) return;
      const val = (r, key) => (r.status === 'fulfilled' ? (r.value[key] || []) : []);
      setD({
        leaves: val(lv, 'leaves'),
        attendance: val(at, 'attendance'),
        projects: val(pr, 'projects'),
        performance: val(pf, 'performance')
      });
    });
    return () => { alive = false; };
  }, []);

  if (!d) return <div className="ws-page"><h1>My Dashboard</h1><Spinner /></div>;

  const pendingLeave = d.leaves.filter((l) => String(l.status).toLowerCase() === 'pending').length;
  const approvedLeaveDays = d.leaves.filter((l) => String(l.status).toLowerCase() === 'approved').reduce((s, l) => s + (l.days || 0), 0);
  const presentDays = d.attendance.filter((a) => String(a.status).toLowerCase() === 'present').length;
  const latestPerf = d.performance[0];

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>Welcome, {(user?.name || '').split(' ')[0]}</h1><span className="ws-scope">Your personal workspace</span></div>

      <div className="ws-stats">
        <StatCard label="Present Days (recent)" value={presentDays} accent="#22c55e" />
        <StatCard label="Approved Leave (days)" value={approvedLeaveDays} />
        <StatCard label="Pending Leave" value={pendingLeave} />
        <StatCard label="My Projects" value={d.projects.length} />
        <StatCard label="Latest Rating" value={latestPerf ? latestPerf.rating : '—'} sub={latestPerf ? latestPerf.cycle : undefined} />
      </div>

      <div className="ws-grid2">
        <Card title="My Recent Leave" sub="Your requests">
          {d.leaves.length === 0 ? <EmptyState>No leave requests yet.</EmptyState> : (
            <ul className="ws-list">
              {d.leaves.slice(0, 6).map((l) => (
                <li key={l._id}><span>{l.type} · {l.days} day{l.days === 1 ? '' : 's'}</span><StatusPill value={l.status} /></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="My Projects" sub="What you're assigned to">
          {d.projects.length === 0 ? <EmptyState>No projects assigned.</EmptyState> : (
            <ul className="ws-list">
              {d.projects.slice(0, 6).map((p) => (
                <li key={p._id}><span>{p.name}</span><StatusPill value={p.status} /></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
