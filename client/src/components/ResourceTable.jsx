/* A generic, scoped data table. Fetches a list endpoint, auto-detects the array
 * in the response ({count, employees:[…]} → the array), and renders the given
 * columns. The BACKEND scopes every response by the caller's role/team/self, so
 * this component shows exactly what the API returns and nothing more. */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Spinner, EmptyState, ErrorNote } from './ui';

export default function ResourceTable({ endpoint, columns, searchable = true, filter, initialFilters }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    api.get(endpoint)
      .then((data) => {
        if (!alive) return;
        const arr = Array.isArray(data) ? data : Object.values(data).find((v) => Array.isArray(v)) || [];
        setRows(filter ? arr.filter(filter) : arr);
      })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [endpoint, filter]);

  const filtered = useMemo(() => {
    if (!rows) return rows;
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => columns.some((c) => {
      try { const v = c.get(r); return v != null && String(v).toLowerCase().includes(needle); } catch { return false; }
    }));
  }, [rows, q, columns]);

  if (error) return <ErrorNote error={error} />;
  if (rows === null) return <Spinner />;

  return (
    <div>
      {searchable && (
        <div className="ws-toolbar">
          <input className="ws-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <span className="ws-count">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        </div>
      )}
      <div className="ws-tablewrap">
        <table className="ws-table">
          <thead>
            <tr>{columns.map((c) => <th key={c.label} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={columns.length}><EmptyState>No records match.</EmptyState></td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r._id || r.employeeId || r.id || i}>
                {columns.map((c) => <td key={c.label} className={c.align === 'right' ? 'r' : ''}>{renderCell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(col, row) {
  try {
    const v = col.get(row);
    return col.render ? col.render(v, row) : (v == null || v === '' ? <span className="ws-muted">—</span> : v);
  } catch { return <span className="ws-muted">—</span>; }
}
