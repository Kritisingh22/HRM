/* ============================================================
   Transfer Tickets — Manager portal for employee transfer requests.
   
   Tabs: My Requests, Awaiting My Approval, All Tickets
   ============================================================ */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ResourceView, type FieldDef, type FilterDef } from '@/components/ui/ResourceView';
import { EmpCell, Pill, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { niceDate, dateRange } from '@/lib/date';
import type { TransferTicket, TransferTicketStatus } from '@/types';
import { listTransferTickets, getTransferTicket, approveTransferTicket, rejectTransferTicket, cancelTransferTicket, getDiscoverableEmployees, getAvailableTargets } from '@/api/transferTickets';

type TabKey = 'my-requests' | 'awaiting-approval' | 'all';

const STATUS_COLORS: Record<TransferTicketStatus, string> = {
  'Pending Current Manager Approval': 'warn',
  'Pending Current HR Approval': 'info',
  'Pending Target HR Approval': 'info',
  'Pending Target Manager Approval': 'info',
  'Approved': 'success',
  'Rejected': 'danger',
  'Cancelled': 'muted',
  'Completed': 'success',
};

export function TransferTicketsPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>('my-requests');
  const [tickets, setTickets] = useState<TransferTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch tickets on mount and tab change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const statusFilter = tab === 'awaiting-approval' 
      ? 'Pending Current Manager Approval' 
      : tab === 'my-requests' 
        ? undefined 
        : undefined;

    listTransferTickets({ status: statusFilter })
      .then(({ transferTickets }) => {
        if (!cancelled) {
          let filtered = transferTickets;
          if (tab === 'my-requests') {
            filtered = transferTickets.filter(t => t.requestedBy && typeof t.requestedBy === 'object' && t.requestedBy.id === user?.employeeId);
          } else if (tab === 'awaiting-approval') {
            filtered = transferTickets.filter(t => 
              (t.currentManager && typeof t.currentManager === 'object' && t.currentManager.id === user?.employeeId) ||
              (t.targetManager && typeof t.targetManager === 'object' && t.targetManager.id === user?.employeeId)
            );
          }
          setTickets(filtered);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load transfer tickets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab, user?.employeeId]);

  const statusFilterDef: FilterDef<TransferTicket> = {
    key: 'status',
    label: 'All statuses',
    options: [
      'Pending Current Manager Approval',
      'Pending Current HR Approval',
      'Pending Target HR Approval',
      'Pending Target Manager Approval',
      'Approved',
      'Rejected',
      'Cancelled',
      'Completed',
    ].map(s => ({ value: s, label: s })),
    match: (t, v) => t.status === v,
  };

  const ticketColumns = useMemo(() => [
    { header: 'Ticket #', render: (t: TransferTicket) => <span className="num">{t.ticketNumber}</span> },
    { header: 'Employee', render: (t: TransferTicket) => {
      const emp = typeof t.employee === 'object' ? t.employee : null;
      return <EmpCell name={emp?.fullName || '—'} sub={emp?.employeeId || '—'} seed={emp?.id || t.employee as string} />;
    }},
    { header: 'Current Manager', render: (t: TransferTicket) => {
      const mgr = typeof t.currentManager === 'object' ? t.currentManager : null;
      return mgr ? `${mgr.fullName} (${mgr.employeeId})` : t.currentManagerEmployeeId || '—';
    }},
    { header: 'Target Manager', render: (t: TransferTicket) => {
      const mgr = typeof t.targetManager === 'object' ? t.targetManager : null;
      return mgr ? `${mgr.fullName} (${mgr.employeeId})` : t.targetManagerEmployeeId || '—';
    }},
    { header: 'Current HR', render: (t: TransferTicket) => {
      const hr = typeof t.currentHr === 'object' ? t.currentHr : null;
      return hr ? `${hr.fullName} (${hr.employeeId})` : t.currentHrEmployeeId || '—';
    }},
    { header: 'Target HR', render: (t: TransferTicket) => {
      const hr = typeof t.targetHr === 'object' ? t.targetHr : null;
      return hr ? `${hr.fullName} (${hr.employeeId})` : t.targetHrEmployeeId || '—';
    }},
    { header: 'Status', render: (t: TransferTicket) => <Pill status={STATUS_COLORS[t.status] as any}>{t.status}</Pill> },
    { header: 'Requested', render: (t: TransferTicket) => <span className="num">{niceDate(t.createdAt)}</span> },
    { header: 'Effective Date', render: (t: TransferTicket) => <span className="num">{niceDate(t.requestedEffectiveDate)}</span> },
  ], []);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'my-requests', label: `My Requests (${tickets.length})` },
    { key: 'awaiting-approval', label: 'Awaiting My Approval' },
    { key: 'all', label: 'All Tickets' },
  ];

  const handleAction = async (key: string, ticket: TransferTicket) => {
    if (key === 'view') {
      navigate(`/transfer-tickets/${ticket.id}`);
      return;
    }
    if (key === 'approve') {
      try {
        const { transferTicket } = await approveTransferTicket(ticket.id, { reason: '' });
        setTickets(prev => prev.map(t => t.id === ticket.id ? transferTicket : t));
        toast('Transfer request approved.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to approve', 'error');
      }
      return;
    }
    if (key === 'reject') {
      const reason = window.prompt('Rejection reason (required):');
      if (!reason) return;
      try {
        const { transferTicket } = await rejectTransferTicket(ticket.id, { reason });
        setTickets(prev => prev.map(t => t.id === ticket.id ? transferTicket : t));
        toast('Transfer request rejected.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to reject', 'error');
      }
      return;
    }
    if (key === 'cancel') {
      if (!window.confirm('Cancel this transfer request?')) return;
      const reason = window.prompt('Cancellation reason (optional):') || '';
      try {
        const { transferTicket } = await cancelTransferTicket(ticket.id, { reason });
        setTickets(prev => prev.map(t => t.id === ticket.id ? transferTicket : t));
        toast('Transfer request cancelled.', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to cancel', 'error');
      }
      return;
    }
  };

  const ticketActions = (t: TransferTicket) => {
    const actions: Array<{ key: string; label: string; variant?: 'ghost' | 'danger' }> = [];
    
    // View action for all
    actions.push({ key: 'view', label: 'View', variant: 'ghost' });

    // Check if current user can act on this ticket
    const isCurrentManager = t.currentManager && typeof t.currentManager === 'object' && t.currentManager.id === user?.employeeId;
    const isTargetManager = t.targetManager && typeof t.targetManager === 'object' && t.targetManager.id === user?.employeeId;
    const isRequester = t.requestedBy && typeof t.requestedBy === 'object' && t.requestedBy.id === user?.employeeId;
    const isPending = ['Pending Current Manager Approval', 'Pending Current HR Approval', 'Pending Target HR Approval', 'Pending Target Manager Approval'].includes(t.status);

    if (isPending) {
      // Managers cannot approve/reject their own request or a transfer of their own employee record
      const isOwnRequest = t.requestedBy && typeof t.requestedBy === 'object' && t.requestedBy.id === user?.employeeId;
      const isOwnRecord = t.employee && typeof t.employee === 'object' && t.employee.employeeId === user?.employeeId;
      if (!isOwnRequest && !isOwnRecord) {
        if ((t.status === 'Pending Current Manager Approval' && isCurrentManager) ||
            (t.status === 'Pending Target Manager Approval' && isTargetManager)) {
          actions.push({ key: 'approve', label: 'Approve' });
          actions.push({ key: 'reject', label: 'Reject', variant: 'danger' });
        }
      }
    }

    if (isRequester && ['Pending Current Manager Approval', 'Pending Current HR Approval', 'Pending Target HR Approval', 'Pending Target Manager Approval'].includes(t.status)) {
      actions.push({ key: 'cancel', label: 'Cancel', variant: 'danger' });
    }

    return actions;
  };

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Employee Transfer Requests</h2>
            <div className="sub">Create and manage employee transfer requests between teams</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={16} /> New Transfer Request
          </button>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {error && (
          <div className="card" style={{ marginTop: 16, borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)' }}>
            <Icon name="alertTriangle" size={16} style={{ color: 'var(--color-danger)' }} />
            <span style={{ marginLeft: 8 }}>{error}</span>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <Icon name="loader" size={32} className="spin" />
              <p>Loading transfer tickets…</p>
            </div>
          ) : (
            <ResourceView
              rows={tickets}
              rowId={(t) => t.id}
              columns={ticketColumns}
              search={(t) => `${t.ticketNumber} ${typeof t.employee === 'object' ? t.employee.fullName : ''} ${t.currentManagerEmployeeId} ${t.targetManagerEmployeeId}`}
              filters={tab !== 'awaiting-approval' ? [statusFilterDef] : []}
              actions={ticketActions}
              onAction={handleAction}
              detail={(t) => [
                'Transfer Request',
                ['Ticket Number', t.ticketNumber],
                ['Employee', typeof t.employee === 'object' ? `${t.employee.fullName} (${t.employee.employeeId})` : t.employee as string],
                ['Current Manager', typeof t.currentManager === 'object' ? `${t.currentManager.fullName} (${t.currentManager.employeeId})` : t.currentManagerEmployeeId],
                ['Target Manager', typeof t.targetManager === 'object' ? `${t.targetManager.fullName} (${t.targetManager.employeeId})` : t.targetManagerEmployeeId],
                ['Current HR', typeof t.currentHr === 'object' ? `${t.currentHr.fullName} (${t.currentHr.employeeId})` : t.currentHrEmployeeId],
                ['Target HR', typeof t.targetHr === 'object' ? `${t.targetHr.fullName} (${t.targetHr.employeeId})` : t.targetHrEmployeeId],
                ['Reason', t.reason],
                ['Business Justification', t.businessJustification || '—'],
                ['Requested Effective Date', niceDate(t.requestedEffectiveDate)],
                ['Status', <Pill status={STATUS_COLORS[t.status] as any}>{t.status}</Pill>],
                ['Current Step', t.currentStep],
                ['Requested By', typeof t.requestedBy === 'object' ? `${t.requestedBy.fullName} (${t.requestedBy.employeeId})` : t.requestedBy as string],
                ['Created', niceDate(t.createdAt)],
                ['Updated', niceDate(t.updatedAt)],
              ]}
              emptyText="No transfer tickets found."
              emptyIcon="arrowRightLeft"
            />
          )}
        </div>
      </section>
    </div>
  );
}

// Create Transfer Request Modal
function CreateTransferRequestModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<{
    employeeId: string;
    targetManagerId: string;
    targetHrId: string;
    reason: string;
    businessJustification: string;
    requestedEffectiveDate: string;
    supportingDocument: string;
  }>({
    employeeId: '',
    targetManagerId: '',
    targetHrId: '',
    reason: '',
    businessJustification: '',
    requestedEffectiveDate: new Date().toISOString().split('T')[0],
    supportingDocument: '',
  });
  const [employees, setEmployees] = useState<DiscoverableEmployee[]>([]);
  const [managers, setManagers] = useState<TransferTarget[]>([]);
  const [hrs, setHrs] = useState<TransferTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ employees: empData }, { managers: mgrData, hrs: hrData }] = await Promise.all([
        getDiscoverableEmployees(),
        getAvailableTargets(),
      ]);
      setEmployees(empData);
      setManagers(mgrData);
      setHrs(hrData);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createTransferTicket(formData);
      toast('Transfer request created successfully!', 'success');
      onClose();
      onSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create transfer request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Employee Transfer Request</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: 24 }}>
            {loading ? (
              <div className="empty-state"><Icon name="loader" size={32} className="spin" />Loading…</div>
            ) : (
              <>
                {step === 1 && (
                  <div>
                    <h4>Step 1: Select Employee</h4>
                    <div className="field">
                      <label>Employee <span className="req">*</span></label>
                      <select
                        value={formData.employeeId}
                        onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                        required
                        disabled={employees.length === 0}
                      >
                        <option value="">Select an employee…</option>
                        {employees.map(emp => (
                          <option key={emp._id} value={emp._id}>
                            {emp.fullName} ({emp.employeeId}) — {emp.designation} — Current Mgr: {emp.currentManagerName}, HR: {emp.currentHrName}
                          </option>
                        ))}
                      </select>
                      {employees.length === 0 && <span className="hint">No employees available for transfer (all are in your team or have no manager/HR assigned).</span>}
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-danger" onClick={onClose}>Cancel</button>
                      <button type="button" className="btn btn-primary" onClick={() => setStep(2)} disabled={!formData.employeeId}>Next</button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <h4>Step 2: Select Target Manager & HR</h4>
                    <div className="field">
                      <label>Target Manager <span className="req">*</span></label>
                      <select
                        value={formData.targetManagerId}
                        onChange={e => setFormData({ ...formData, targetManagerId: e.target.value })}
                        required
                        disabled={managers.length === 0}
                      >
                        <option value="">Select a manager…</option>
                        {managers.map(mgr => (
                          <option key={mgr._id} value={mgr._id}>
                            {mgr.fullName} ({mgr.employeeId}) — {mgr.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Target HR <span className="req">*</span></label>
                      <select
                        value={formData.targetHrId}
                        onChange={e => setFormData({ ...formData, targetHrId: e.target.value })}
                        required
                        disabled={hrs.length === 0}
                      >
                        <option value="">Select an HR…</option>
                        {hrs.map(hr => (
                          <option key={hr._id} value={hr._id}>
                            {hr.fullName} ({hr.employeeId}) — {hr.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                      <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={!formData.targetManagerId || !formData.targetHrId}>Next</button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div>
                    <h4>Step 3: Reason & Details</h4>
                    <div className="field">
                      <label>Reason for Transfer <span className="req">*</span></label>
                      <textarea
                        value={formData.reason}
                        onChange={e => setFormData({ ...formData, reason: e.target.value })}
                        required
                        rows={3}
                        placeholder="Explain why this transfer is needed…"
                      />
                    </div>
                    <div className="field">
                      <label>Business Justification</label>
                      <textarea
                        value={formData.businessJustification}
                        onChange={e => setFormData({ ...formData, businessJustification: e.target.value })}
                        rows={3}
                        placeholder="Business case, project needs, etc."
                      />
                    </div>
                    <div className="field">
                      <label>Requested Effective Date <span className="req">*</span></label>
                      <input
                        type="date"
                        value={formData.requestedEffectiveDate}
                        onChange={e => setFormData({ ...formData, requestedEffectiveDate: e.target.value })}
                        required
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="field">
                      <label>Supporting Document (URL or path)</label>
                      <input
                        type="text"
                        value={formData.supportingDocument}
                        onChange={e => setFormData({ ...formData, supportingDocument: e.target.value })}
                        placeholder="Optional: link to supporting document"
                      />
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
                      <button type="submit" className="btn btn-primary" disabled={submitting || !formData.reason}>
                        {submitting ? 'Creating…' : 'Create Transfer Request'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// We need to hook the modal into the main component
// This is a simplified approach - in reality we'd use a proper modal state
function TransferTicketsPageWithModal() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <TransferTicketsPage />
      <CreateTransferRequestModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => setRefreshKey(k => k + 1)}
      />
    </>
  );
}

export default TransferTicketsPageWithModal;