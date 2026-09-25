/* HR User Management — /api/users (HR needs users:read; the backend refuses this
 * to Manager/Employee). Client-side tabs filter the already-returned list into
 * All / Employees / Managers / HR / Active / Inactive. Role changes and
 * SUPER_ADMIN assignment are governed entirely by the backend (H1 escalation
 * protections); this screen is a directory view. */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState } from '../../components/ui';

const TABS = [
  { key: 'all', label: 'All Users', f: () => true },
  { key: 'employees', label: 'Employees', f: (u) => u.role === 'EMPLOYEE' },
  { key: 'managers', label: 'Managers', f: (u) => u.role === 'MANAGER' },
  { key: 'hr', label: 'HR Users', f: (u) => ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(u.role) },
  { key: 'active', label: 'Active', f: (u) => u.status === 'active' },
  { key: 'inactive', label: 'Inactive', f: (u) => u.status !== 'active' }
];

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let alive = true;
    api.get('/api/users').then((d) => { if (alive) setUsers(d.users || []); }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => (users || []).filter(TABS.find((t) => t.key === tab).f), [users, tab]);

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>User Management</h1><span className="ws-scope">Accounts &amp; roles</span></div>
      <Card>
        <div className="ws-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'ws-tab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
              {t.label}{users ? ' (' + users.filter(t.f).length + ')' : ''}
            </button>
          ))}
        </div>
        {error ? <ErrorNote error={error} /> : users === null ? <Spinner /> : shown.length === 0 ? <EmptyState>No users in this group.</EmptyState> : (
          <div className="ws-tablewrap">
            <table className="ws-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Employee ID</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id || u._id || u.email}>
                    <td>{u.fullName}</td><td>{u.email}</td><td>{u.role}</td><td>{u.employeeId || <span className="ws-muted">—</span>}</td>
                    <td><StatusPill value={u.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
