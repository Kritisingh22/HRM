/* HR Dashboard — company-wide metrics from real backend data.
 * Fetches /api/reports/summary and /api/analytics/overview which are scoped
 * to company-wide for HR/Admin/SUPER_ADMIN roles.
 */
import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Card, StatCard, MiniBars, Spinner, ErrorNote } from 'ui';

const TEAL = '#509888';

export default function HRDashboard() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    Promise.allSettled([api.get('/api/reports/summary'), api.get('/api/analytics/overview')])
      .then(([rep, ana]) => {
        if (!alive) return;
        if (rep.status === 'rejected' && ana.status === 'rejected') {
          setState({ loading: false, error: rep.reason });
          return;
        }
        setState({
          loading: false,
          rep: rep.status === 'fulfilled' ? rep.value : null,
          ana: ana.status === 'fulfilled' ? ana.value : null
        });
      });
    return () => { alive = false; };
  }, []);

  if (state.loading) return <div className="ws-page"><h1>HR Dashboard</h1><Spinner /></div>;
  if (state.error) return <div className="ws-page"><h1>HR Dashboard</h1><ErrorNote error={state.error} /></div>;

  const m = state.rep?.metrics || {};
  const ana = state.ana || {};
  const deptData = (state.rep?.headcountByDepartment || ana.headcountByDepartment || []).map((d) => ({ label: d.department, value: d.count }));
  const leaveData = (ana.leaveByStatus || []).map((d) => ({ label: d.status, value: d.count }));
  const projData = (ana.projectsByStatus || []).map((d) => ({ label: d.status, value: d.count }));
  const perf = ana.performance || {};

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>HR Dashboard</h1><span className="ws-scope">Company-wide</span></div>

      <div className="ws-stats">
        <StatCard label="Headcount" value={m.headcount ?? ana.headcount ?? '—'} accent={TEAL} />
        <StatCard label="On Leave Today" value={m.onLeaveToday ?? '—'} />
        <StatCard label="Pending Leave" value={m.pendingLeaves ?? '—'} />
        <StatCard label="Open Positions" value={m.openPositions ?? ana.openPositions ?? '—'} />
        <StatCard label="Avg Performance" value={perf.avgRating != null ? perf.avgRating : '—'} sub={perf.reviews != null ? perf.reviews + ' reviews' : undefined} />
      </div>

      <div className="ws-grid2">
        <Card title="Department Distribution" sub="Headcount by department"><MiniBars data={deptData} accent={TEAL} /></Card>
        <Card title="Leave Overview" sub="Requests by status"><MiniBars data={leaveData} accent="#f59e0b" /></Card>
      </div>
      <div className="ws-grid2">
        <Card title="Projects" sub="By status"><MiniBars data={projData} accent="#8b5cf6" /></Card>
        <Card title="Payroll Summary" sub="Net by status">
          <MiniBars data={(ana.payrollByStatus || []).map((p) => ({ label: p.status, value: p.count }))} accent="#22c55e" />
        </Card>
      </div>
    </div>
  );
}