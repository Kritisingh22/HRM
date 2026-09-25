/* Small shared UI primitives used across all three workspaces. Presentational
 * only — no data access, no role logic. */

export function Spinner({ label = 'Loading…' }) {
  return <div className="ws-state"><span className="ws-spin" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ children = 'Nothing to show yet.' }) {
  return <div className="ws-state ws-empty">{children}</div>;
}

export function ErrorNote({ error }) {
  // Friendly, safe message — never a stack trace. 403s from the API become an
  // access note rather than a scary error.
  const status = error?.status;
  const msg = status === 403
    ? 'You do not have permission to view this data.'
    : (error?.message || 'Something went wrong. Please try again.');
  return <div className="ws-state ws-err">{msg}</div>;
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div className="ws-stat">
      <span className="ws-stat-label">{label}</span>
      <span className="ws-stat-value" style={accent ? { color: accent } : undefined}>{value}</span>
      {sub != null && <span className="ws-stat-sub">{sub}</span>}
    </div>
  );
}

export function Card({ title, sub, right, children, className = '' }) {
  return (
    <section className={'ws-card ' + className}>
      {(title || right) && (
        <div className="ws-card-head">
          <div>{title && <h2>{title}</h2>}{sub && <p className="ws-card-sub">{sub}</p>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_CLASS = {
  active: 'ok', approved: 'ok', paid: 'ok', completed: 'ok', selected: 'ok', open: 'ok', present: 'ok',
  pending: 'warn', 'on leave': 'warn', probation: 'warn', screening: 'warn', 'in progress': 'warn',
  rejected: 'bad', inactive: 'bad', exited: 'bad', suspended: 'bad', absent: 'bad', closed: 'bad', overdue: 'bad'
};
export function StatusPill({ value }) {
  if (value == null || value === '') return <span className="ws-muted">—</span>;
  const key = String(value).toLowerCase();
  return <span className={'ws-pill ' + (STATUS_CLASS[key] || 'neutral')}>{value}</span>;
}

/* Minimal horizontal bar list — a dependency-free chart for distributions. */
export function MiniBars({ data, accent = '#509888' }) {
  const rows = (data || []).filter((d) => d && d.label != null);
  const max = Math.max(1, ...rows.map((d) => Number(d.value) || 0));
  if (!rows.length) return <EmptyState>No data.</EmptyState>;
  return (
    <div className="ws-bars">
      {rows.map((d) => (
        <div className="ws-bar-row" key={d.label}>
          <span className="ws-bar-label" title={d.label}>{d.label}</span>
          <span className="ws-bar-track"><span className="ws-bar-fill" style={{ width: ((Number(d.value) || 0) / max * 100) + '%', background: accent }} /></span>
          <span className="ws-bar-val">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export const initials = (n) => (n || '').split(/\s+/).map((x) => x[0] || '').slice(0, 2).join('').toUpperCase();

/* Render a possibly-populated "employee/owner/manager" ref safely. */
export function personName(ref) {
  if (!ref) return '—';
  if (typeof ref === 'string') return ref;
  return ref.fullName || ref.name || ref.employeeId || '—';
}
export function personId(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref.employeeId || ref._id || '';
}
