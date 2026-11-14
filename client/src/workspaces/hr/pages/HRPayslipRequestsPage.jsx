/* HR Payslip Requests — review and resolve employee payslip requests. */
import { useCallback, useEffect, useState } from 'react';
import { Card, StatusPill, Spinner, ErrorNote, EmptyState, Modal } from 'ui';
import { DataTable } from 'ui';

import { Field } from 'ui';
import { useList } from '../../../hooks/useList';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from 'ui';
import { api } from '../../../services/api';

const STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected', 'Resolved', 'Cancelled'];
const TYPES = ['Missing', 'Incorrect', 'Reissue', 'Other'];
const errText = (e) => e?.data?.details?.[0] || e?.message || 'Something went wrong.';

const COLS = [
  { label: 'Employee', get: (r) => r.employee ? `${r.employee.fullName} (${r.employee.employeeId})` : '—' },
  { label: 'Department', get: (r) => r.employee?.department || '—' },
  { label: 'Period', get: (r) => r.period },
  { label: 'Type', get: (r) => r.type },
  { label: 'Reason', get: (r) => r.reason, render: (v) => <span style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }} title={v}>{v}</span> },
  { label: 'Status', get: (r) => r.status, render: (v) => <StatusPill value={v} /> },
  { label: 'Submitted', get: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
  { label: 'Reviewed By', get: (r) => r.reviewedBy ? r.reviewedBy.fullName : '—' },
  { label: 'Reviewed At', get: (r) => r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
];

export default function HRPayslipRequestsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useList('/api/payslip-requests');

  const canReview = hasPermission('payslipRequests:review');
  const [reviewing, setReviewing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const statusLabels = {
    Pending: 'Pending',
    'Under Review': 'Under Review',
    Approved: 'Approved',
    Rejected: 'Rejected',
    Resolved: 'Resolved',
    Cancelled: 'Cancelled',
  };

  async function act(id, action, label) {
    setBusyId(id);
    try {
      await api.put('/api/payslip-requests/' + id, { action, reviewNotes: 'Reviewed by HR' });
      toast.success(label);
      await reload();
    } catch (e) {
      setBusyId(null);
      toast.error(errText(e));
    }
  }

  async function startReview(id) {
    setReviewing({ id, reviewNotes: '' });
  }

  async function submitReview(id, action) {
    setBusyId(id);
    try {
      await api.put('/api/payslip-requests/' + id, { action, reviewNotes: reviewing.reviewNotes });
      toast.success(action === 'approve' ? 'Request approved. Payroll team notified to generate payslip.' : 'Request rejected.');
      setReviewing(null);
      await reload();
    } catch (e) {
      setBusyId(null);
      toast.error(errText(e));
    }
  }

  const pendingRows = (rows || []).filter(r => ['Pending', 'Under Review', 'Approved'].includes(r.status));
  const processedRows = (rows || []).filter(r => !['Pending', 'Under Review', 'Approved'].includes(r.status));

  const actions = (r) => {
    if (!canReview) return <span className="ws-muted">—</span>;
    if (r.status === 'Pending') {
      return (
        <>
          <button className="ws-btn sm" onClick={() => startReview(r._id)}>Review</button>
        </>
      );
    }
    if (r.status === 'Under Review') {
      return (
        <>
          <button className="ws-btn sm ok" onClick={() => submitReview(r._id, 'approve')}>Approve</button>
          <button className="ws-btn sm bad" onClick={() => submitReview(r._id, 'reject')}>Reject</button>
        </>
      );
    }
    if (r.status === 'Approved') {
      return (
        <>
          <button className="ws-btn sm primary" onClick={() => submitReview(r._id, 'resolve')}>Mark Resolved</button>
        </>
      );
    }
    return <span className="ws-muted">—</span>;
  };

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>Payslip Requests</h1>
        <span className="ws-scope">Review and resolve employee payslip requests</span>
      </div>

      {/* Pending Requests */}
      <Card title="Pending & Under Review" sub={`${pendingRows.length} request${pendingRows.length !== 1 ? 's' : ''} awaiting action`}>
        {loading ? <Spinner /> : pendingRows.length === 0 ? <EmptyState>No pending requests.</EmptyState> : (
          <DataTable
            columns={COLS}
            rows={pendingRows}
            loading={loading}
            error={error}
            actions={canReview ? actions : undefined}
            emptyText="No pending requests."
          />
        )}
      </Card>

      {/* Processed Requests */}
      <Card title="Processed Requests" sub={`${processedRows.length} request${processedRows.length !== 1 ? 's' : ''} completed`}>
        {loading ? <Spinner /> : processedRows.length === 0 ? <EmptyState>No processed requests.</EmptyState> : (
          <DataTable
            columns={COLS}
            rows={processedRows}
            loading={loading}
            error={error}
            actions={undefined}
            emptyText="No processed requests."
          />
        )}
      </Card>

      {/* Review Modal */}
      {reviewing && (
        <Modal open size="lg" title={`Review Request — ${reviewing.employee?.fullName} (${reviewing.period})`} onClose={() => setReviewing(null)}>
          <div style={{ marginBottom: 16 }}>
            <p><strong>Employee:</strong> {reviewing.employee?.fullName} ({reviewing.employee?.employeeId})</p>
            <p><strong>Department:</strong> {reviewing.employee?.department || '—'}</p>
            <p><strong>Period:</strong> {reviewing.period}</p>
            <p><strong>Type:</strong> {reviewing.type}</p>
            <p><strong>Reason:</strong> {reviewing.reason}</p>
            {reviewing.payslip && <p><strong>Related Payslip:</strong> {reviewing.payslip.period} (Net: ₹{Number(reviewing.payslip.net).toLocaleString('en-IN')})</p>}
            <p><strong>Submitted:</strong> {new Date(reviewing.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            <p><strong>Current Status:</strong> {statusLabels[reviewing.status] || reviewing.status}</p>
            {reviewing.reviewedBy && <p><strong>Reviewed By:</strong> {reviewing.reviewedBy.fullName} at {new Date(reviewing.reviewedAt).toLocaleString('en-IN')}</p>}
            {reviewing.reviewNotes && <p><strong>Review Notes:</strong> {reviewing.reviewNotes}</p>}
          </div>

          <Field label="Review Notes" full>
            <textarea value={reviewing.reviewNotes} onChange={(e) => setReviewing({ ...reviewing, reviewNotes: e.target.value })} placeholder="Add review notes (optional)" rows={3} />
          </Field>

          <div className="ws-modal-actions">
            <button className="ws-btn" onClick={() => setReviewing(null)} disabled={busyId === reviewing._id}>Close</button>
            {reviewing.status === 'Pending' && (
              <button className="ws-btn" onClick={() => act(reviewing._id, 'review', 'Request marked as under review.')} disabled={busyId === reviewing._id}>Start Review</button>
            )}
            {reviewing.status === 'Under Review' && (
              <>
                <button className="ws-btn bad" onClick={() => submitReview(reviewing._id, 'reject')} disabled={busyId === reviewing._id}>Reject</button>
                <button className="ws-btn ok" onClick={() => submitReview(reviewing._id, 'approve')} disabled={busyId === reviewing._id}>Approve</button>
              </>
            )}
            {reviewing.status === 'Approved' && (
              <button className="ws-btn primary" onClick={() => submitReview(reviewing._id, 'resolve')} disabled={busyId === reviewing._id}>Mark Resolved</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}