/* Manager Dashboard — TEAM data only. Built from the manager's own
 * team-scoped records (attendance, leave, projects, performance, todos, helpdesk).
 * The backend returns team-scoped data via /api/dashboard for MANAGER role. */
import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../auth/AuthContext';
import { Card, StatCard, Spinner, ErrorNote, EmptyState, Modal } from 'ui';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get('/api/dashboard')
      .then((data) => {
        if (!alive) return;
        setD(data);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
      });
    return () => { alive = false; };
  }, []);

  if (error) return <div className="ws-page"><h1>Manager Dashboard</h1><ErrorNote error={error} /></div>;
  if (!d) return <div className="ws-page"><h1>Manager Dashboard</h1><Spinner /></div>;

  const BLUE = '#3b82f6';

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Welcome, {(user?.name || '').split(' ')[0]}</h1>
        <span className="ws-scope">Your team only</span>
      </div>

      <div className="ws-stats">
        <StatCard label="Team Size" value={d.employees ?? '—'} accent={BLUE} />
        <StatCard label="Present Today" value={d.presentToday ?? '—'} />
        <StatCard label="On Leave" value={d.onLeave ?? '—'} />
        <StatCard label="Pending Leave" value={d.pendingLeaves ?? '—'} />
        <StatCard label="Active Projects" value={d.activeProjects ?? '—'} />
        <StatCard label="Open Tickets" value={d.openTickets ?? '—'} />
      </div>

      <div className="ws-grid2">
        <Card title="Quick Actions">
          <div className="ws-btn-group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/manager/leave-approvals" className="ws-btn primary">Approve Leave</a>
            <a href="/manager/team" className="ws-btn">View Team</a>
            <a href="/manager/daily-reports" className="ws-btn">Daily Reports</a>
            <a href="/manager/projects" className="ws-btn">Projects</a>
          </div>
        </Card>
        <Card title="Team Health" sub="Key indicators">
          <ul className="ws-list">
            <li><span>Team Members</span><strong>{d.employees ?? '—'}</strong></li>
            <li><span>HR in Team</span><strong>{d.hrCount ?? '—'}</strong></li>
            <li><span>Present Today</span><strong>{d.presentToday ?? '—'}</strong></li>
            <li><span>Pending Leave Requests</span><strong>{d.pendingLeaves ?? '—'}</strong></li>
            <li><span>Payroll Pending</span><strong>{d.payrollPending ?? '—'}</strong></li>
            <li><span>Open Helpdesk Tickets</span><strong>{d.openTickets ?? '—'}</strong></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}