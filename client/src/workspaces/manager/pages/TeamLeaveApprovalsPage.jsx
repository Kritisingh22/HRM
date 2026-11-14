/* Team Leave Approvals — Manager approves/rejects pending leave requests for their team.
 * Backend enforces: manager can only approve requests where approvalAuthority="Manager"
 * AND the employee's manager field matches the manager's employeeId. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../auth/AuthContext';
import { useToast, Modal } from 'ui';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, personName, personId } from 'ui';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const errText = (e) => (e?.status === 403 ? 'That action was not permitted.' : e?.data?.details?.[0] || e?.message || 'Something went wrong.');

export default function TeamLeaveApprovalsPage() {
  const { user } = useAuth();
  const toast = useToast();

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

  // Filter to only pending requests that this manager can action
  const pendingRows = (rows || []).filter((l) =>
    String(l.status).toLowerCase() === 'pending' &&
    l.approvalAuthority === 'Manager' &&
    l.employee?.manager === user?.employeeId
  );

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Team Leave Approvals</h1>
        <span className="ws-scope">Pending requests for your team (Manager authority)</span>
      </div>

      <Card title="Leave Requests Awaiting Decision" sub="Approve or reject your team's requests">
        {error ? <ErrorNote error={error} /> : rows === null ? <Spinner /> : pendingRows.length === 0 ? <EmptyState>No pending leave requests for your team.</EmptyState> : (
          <div className="ws-tablewrap">
            <table className="ws-table">
              <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th className="r">Days</th><th>Status</th><th>Authority</th><th className="r">Action</th></tr></thead>
              <tbody>
                {pendingRows.map((l) => {
                  const busy = busyId === l._id;
                  return (
                    <tr key={l._id}>
                      <td>{personName(l.employee)}</td>
                      <td>{l.type}</td><td>{fmt(l.from)}</td><td>{fmt(l.to)}</td><td className="r">{l.days}</td>
                      <td><StatusPill value={l.status} /></td>
                      <td><span className="ws-badge">{l.approvalAuthority || 'Manager'}</span></td>
                      <td className="r">
                        <span className="ws-actions">
                          <button className="ws-btn sm ok" disabled={busy} onClick={() => act(l._id, 'Approved', 'Leave approved.')}>Approve</button>
                          <button className="ws-btn sm bad" disabled={busy} onClick={() => act(l._id, 'Rejected', 'Leave rejected.')}>Reject</button>
                        </span>
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