/* Employee Payslip Requests — raise and track own payslip requests. */
import { useState } from 'react';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, Modal } from 'ui';
import { DataTable } from 'ui';

import { Field } from 'ui';
import { useList } from '../../../hooks/useList';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from 'ui';
import { api } from '../../../services/api';

const TYPES = ['Missing', 'Incorrect', 'Reissue', 'Other'];
const STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected', 'Resolved', 'Cancelled'];
const errText = (e) => e?.data?.details?.[0] || e?.message || 'Something went wrong.';

const COLS = [
  { label: 'Period', get: (r) => r.period },
  { label: 'Type', get: (r) => r.type },
  { label: 'Reason', get: (r) => r.reason, render: (v) => <span style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }} title={v}>{v}</span> },
  { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> },
  { label: 'Submitted', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
  { label: 'Reviewed', get: (r) => r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
  { label: 'Resolved Payslip', get: (r) => r.resolvedPayslip ? `${r.resolvedPayslip.period} (Net: ₹${Number(r.resolvedPayslip.net).toLocaleString('en-IN')})` : '—' },
];

export default function EmployeePayslipRequestsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/payslip-requests/my');

  const canCreate = hasPermission('payslipRequests:create_own');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ period: '', type: 'Missing', reason: '' });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  function validate() {
    const err = {};
    if (!form.period) err.period = 'Required.';
    if (!form.type) err.type = 'Required.';
    if (!form.reason.trim()) err.reason = 'Required.';
    setFieldErr(err);
    return Object.keys(err).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await api.post('/api/payslip-requests', { period: form.period, type: form.type, reason: form.reason.trim() });
      toast.success('Payslip request submitted.');
      setForm({ period: '', type: 'Missing', reason: '' });
      setCreating(false);
      await reload();
    } catch (err) {
      toast.error(errText(err));
      setBusy(false);
    }
  }

  async function cancelRequest(id) {
    if (!confirm('Cancel this request?')) return;
    try {
      await api.put('/api/payslip-requests/' + id, { action: 'cancel' });
      toast.success('Request cancelled.');
      await reload();
    } catch (err) {
      toast.error(errText(err));
    }
  }

  const actions = (r) => {
    if (['Pending', 'Under Review'].includes(r.status)) {
      return <button className="ws-btn sm bad" onClick={() => cancelRequest(r._id)}>Cancel</button>;
    }
    return <span className="ws-muted">—</span>;
  };

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>My Payslip Requests</h1>
        <span className="ws-scope">Raise and track requests for missing or incorrect payslips</span>
        {canCreate && <div className="ws-page-actions"><button className="ws-btn primary" onClick={() => setCreating(true)}>+ New Request</button></div>}
      </div>

      {creating && (
        <Card title="New Payslip Request" sub="Request a missing, incorrect, or reissued payslip">
          <form onSubmit={submit} className="ws-form-grid">
            <Field label="Pay Period" required error={fieldErr.period} hint="Format: YYYY-MM">
              <input type="month" value={form.period} onChange={set('period')} placeholder="YYYY-MM" />
            </Field>
            <Field label="Request Type" required error={fieldErr.type}>
              <select value={form.type} onChange={set('type')}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Reason" required error={fieldErr.reason} full>
              <textarea value={form.reason} onChange={set('reason')} placeholder="Explain why you need this payslip (missing, incorrect details, reissue, etc.)" rows={4} />
            </Field>
            <div className="ws-modal-actions">
              <button type="button" className="ws-btn" onClick={() => { setCreating(false); setForm({ period: '', type: 'Missing', reason: '' }); setFieldErr({}); }} disabled={busy}>Cancel</button>
              <button type="submit" className="ws-btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Your Requests" sub="Track the status of your payslip requests">
        {error ? <ErrorNote error={error} /> : loading ? <Spinner /> : rows.length === 0 ? <EmptyState>No payslip requests yet. Use “New Request” to submit your first request.</EmptyState> : (
          <DataTable
            columns={COLS}
            rows={rows}
            loading={loading}
            error={error}
            actions={actions}
            emptyText="No requests found."
          />
        )}
      </Card>
    </div>
  );
}