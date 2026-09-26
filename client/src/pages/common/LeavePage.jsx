/* Leave page — role-aware, every action authorised by the backend:
 *  • Employee: sees their OWN leave (self-scoped by the API), can apply and cancel
 *              their own PENDING request. Can select approval authority (Manager/HR).
 *  • Manager:  sees their TEAM's leave, can Approve/Reject pending team requests
 *              (and cancel their own).
 *  • HR/Admin: sees all leave, can Approve/Reject.
 * Apply → POST /api/leaves. Approve/Reject/Cancel → PUT /api/leaves/:id {status}.
 * The server decides whether each action is allowed; the UI only offers it. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, personName, personId } from '../../components/ui';

const TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'];
const APPROVAL_AUTHORITIES = ['Manager', 'HR'];
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const errText = (e) => (e?.status === 403 ? 'That action was not permitted.' : e?.data?.details?.[0] || e?.message || 'Something went wrong.');

export default function LeavePage({ title, scopeNote }) {
  const { user } = useAuth();
  const toast = useToast();
  const isEmployee = user?.role === 'EMPLOYEE';
  const canDecide = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role);

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setRows(null); setError(null);
    api.get('/api/leaves').then((d) => setRows(d.leaves || [])).catch(setError);
  }, []);
  useEffect(load, [load]);

  async function act(id, status, label) {
    setBusyId(id);
    try { await api.put('/api/leaves/' + id, { status }); toast.success(label); load(); }
    catch (e) { setBusyId(null); toast.error(errText(e)); }
  }

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>{title || 'Leave'}</h1>{scopeNote && <span className="ws-scope">{scopeNote}</span>}</div>

      {isEmployee && <ApplyLeave onApplied={load} toast={toast} />}

      <Card title={canDecide ? 'Leave requests' : 'My leave'} sub={canDecide ? 'Approve or reject pending requests' : 'Your leave history'}>
        {error ? <ErrorNote error={error} /> : rows === null ? <Spinner /> : rows.length === 0 ? <EmptyState>No leave requests yet.</EmptyState> : (
          <div className="ws-tablewrap">
            <table className="ws-table">
              <thead><tr>{!isEmployee && <th>Employee</th>}<th>Type</th><th>From</th><th>To</th><th className="r">Days</th><th>Status</th><th>Authority</th><th className="r">Action</th></tr></thead>
              <tbody>
                {rows.map((l) => {
                  const pending = String(l.status).toLowerCase() === 'pending';
                  const isOwn = personId(l.employee) === user?.employeeId;
                  const busy = busyId === l._id;
                  return (
                    <tr key={l._id}>
                      {!isEmployee && <td>{personName(l.employee)}</td>}
                      <td>{l.type}</td><td>{fmt(l.from)}</td><td>{fmt(l.to)}</td><td className="r">{l.days}</td>
                      <td><StatusPill value={l.status} /></td>
                      <td><span className="ws-badge">{l.approvalAuthority || 'Manager'}</span></td>
                      <td className="r">
                        {pending ? (
                          <span className="ws-actions">
                            {canDecide && !isOwn && (
                              <>
                                <button className="ws-btn sm ok" disabled={busy} onClick={() => act(l._id, 'Approved', 'Leave approved.')}>Approve</button>
                                <button className="ws-btn sm bad" disabled={busy} onClick={() => act(l._id, 'Rejected', 'Leave rejected.')}>Reject</button>
                              </>
                            )}
                            {isOwn && <button className="ws-btn sm" disabled={busy} onClick={() => act(l._id, 'Cancelled', 'Leave request cancelled.')}>Cancel</button>}
                            {!canDecide && !isOwn && <span className="ws-muted">—</span>}
                          </span>
                        ) : <span className="ws-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ApplyLeave({ onApplied, toast }) {
  const [f, setF] = useState({ type: TYPES[0], from: '', to: '', reason: '', approvalAuthority: 'Manager' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!f.from || !f.to) return setErr('Pick a start and end date.');
    if (new Date(f.from) > new Date(f.to)) return setErr('The start date must be on or before the end date.');
    setBusy(true);
    try {
      await api.post('/api/leaves', { type: f.type, from: f.from, to: f.to, reason: f.reason, approvalAuthority: f.approvalAuthority });
      toast.success('Leave request submitted.');
      setF({ type: TYPES[0], from: '', to: '', reason: '', approvalAuthority: 'Manager' });
      onApplied();
    } catch (e2) {
      toast.error(e2.status === 400 ? 'Please check the dates (end must be on/after start).' : (e2?.message || 'Could not submit.'));
    } finally { setBusy(false); }
  }

  return (
    <Card title="Apply for leave" sub="Submit a new request to your manager or HR">
      <form onSubmit={submit} className="ws-form-row">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" />
        <select value={f.approvalAuthority} onChange={(e) => setF({ ...f, approvalAuthority: e.target.value })}>
          {APPROVAL_AUTHORITIES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Reason (optional)" />
        <button className="ws-btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
        {err && <span className="pf-msg err">{err}</span>}
      </form>
    </Card>
  );
}
