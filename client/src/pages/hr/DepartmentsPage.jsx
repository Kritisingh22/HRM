/* Departments — derived from the scoped reports summary (headcount by department).
 * HR sees the company; a Manager sees only their team's departments. */
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Card, MiniBars, Spinner, ErrorNote, EmptyState } from '../../components/ui';

export default function DepartmentsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get('/api/reports/summary').then((d) => { if (alive) setRows(d.headcountByDepartment || []); }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>Departments</h1><span className="ws-scope">Headcount by department</span></div>
      <Card>
        {error ? <ErrorNote error={error} /> : rows === null ? <Spinner /> : rows.length === 0 ? <EmptyState>No department data.</EmptyState> : (
          <>
            <MiniBars data={rows.map((d) => ({ label: d.department, value: d.count }))} />
            <div className="ws-tablewrap" style={{ marginTop: 16 }}>
              <table className="ws-table">
                <thead><tr><th>Department</th><th className="r">Headcount</th></tr></thead>
                <tbody>{rows.map((d) => <tr key={d.department}><td>{d.department}</td><td className="r">{d.count}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
