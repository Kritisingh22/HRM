/* Org chart — renders the reporting tree the API returns. The backend scopes it
 * by role (HR/Admin → company, Manager → own team, Employee → own line) and never
 * includes salary/contact fields, so this component just draws whatever it gets. */
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Card, Spinner, ErrorNote, EmptyState, initials } from '../../components/ui';

function Node({ n }) {
  return (
    <li className="org-node">
      <div className="org-card">
        <span className="org-av">{initials(n.name)}</span>
        <div className="org-meta"><b>{n.name}</b><span>{n.designation || '—'}{n.department ? ' · ' + n.department : ''}</span><span className="org-id">{n.employeeId}{n.status ? ' · ' + n.status : ''}</span></div>
      </div>
      {n.reports && n.reports.length > 0 && <ul className="org-children">{n.reports.map((c) => <Node key={c.employeeId} n={c} />)}</ul>}
    </li>
  );
}

const SCOPE_LABEL = { company: 'Company-wide', team: 'Your team', self: 'Your reporting line' };

export default function OrgChartPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get('/api/org-chart').then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>Org Chart</h1>{data && <span className="ws-scope">{SCOPE_LABEL[data.scope] || 'Reporting tree'}</span>}</div>
      <Card>
        {error ? <ErrorNote error={error} /> : !data ? <Spinner /> : (data.roots || []).length === 0 ? <EmptyState>No reporting structure to show.</EmptyState> : (
          <ul className="org-tree">{data.roots.map((r) => <Node key={r.employeeId} n={r} />)}</ul>
        )}
      </Card>
    </div>
  );
}
