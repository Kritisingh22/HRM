/* My Manager — the employee's own reporting manager. Read from the employee's own
 * record (self-scoped) and enriched with the manager's name via the (self-scoped)
 * org chart, which for an employee returns exactly their reporting line. No other
 * employees are reachable here. */
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { Card, Spinner, EmptyState, initials } from '../../components/ui';

export default function MyManagerPage() {
  const { user } = useAuth();
  const [mgr, setMgr] = useState(undefined); // undefined=loading, null=none

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.employeeId) { setMgr(null); return; }
      try {
        const { employee } = await api.get('/api/employees/' + user.employeeId);
        const mgrId = employee?.manager;
        if (!mgrId) { if (alive) setMgr(null); return; }
        let node = { employeeId: mgrId, name: mgrId };
        try {
          const org = await api.get('/api/org-chart');
          const flat = [];
          const walk = (n) => { flat.push(n); (n.reports || []).forEach(walk); };
          (org.roots || []).forEach(walk);
          const found = flat.find((n) => n.employeeId === mgrId);
          if (found) node = found;
        } catch { /* org chart optional */ }
        if (alive) setMgr(node);
      } catch { if (alive) setMgr(null); }
    })();
    return () => { alive = false; };
  }, [user]);

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>My Manager</h1><span className="ws-scope">Who you report to</span></div>
      <Card>
        {mgr === undefined ? <Spinner /> : mgr === null ? <EmptyState>You don’t have a reporting manager on record.</EmptyState> : (
          <div className="pf-head" style={{ marginBottom: 0 }}>
            <span className="pf-avatar">{initials(mgr.name)}</span>
            <div>
              <h2>{mgr.name}</h2>
              <p className="ws-muted">{mgr.designation || 'Manager'}{mgr.department ? ' · ' + mgr.department : ''} · {mgr.employeeId}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
