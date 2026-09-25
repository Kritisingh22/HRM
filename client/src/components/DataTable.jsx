/* Controlled data table: the PARENT owns the rows (so it can reload them from the
 * backend after a create/update/delete) and this component only renders them.
 * Same markup and classes as ResourceTable, plus an optional per-row Actions
 * column. Distinguishes "no records yet" from "nothing matches your search". */
import { useMemo, useState } from 'react';
import { Spinner, EmptyState, ErrorNote } from './ui';

export default function DataTable({ columns, rows, actions, loading, error, searchable = true, emptyText = 'No records yet.' }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!rows) return rows;
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => columns.some((c) => {
      try { const v = c.get(r); return v != null && String(v).toLowerCase().includes(needle); } catch { return false; }
    }));
  }, [rows, q, columns]);

  if (error) return <ErrorNote error={error} />;
  if (loading || rows == null) return <Spinner />;

  const colCount = columns.length + (actions ? 1 : 0);
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
            <tr>
              {columns.map((c) => <th key={c.label} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}
              {actions && <th className="r wsact">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={colCount}><EmptyState>{q.trim() ? 'No records match your search.' : emptyText}</EmptyState></td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r._id || r.employeeId || r.jobId || r.id || i}>
                {columns.map((c) => <td key={c.label} className={c.align === 'right' ? 'r' : ''}>{renderCell(c, r)}</td>)}
                {actions && <td className="r wsact"><span className="ws-actions">{actions(r)}</span></td>}
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
