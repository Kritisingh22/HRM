/* ============================================================
   Transfer Ticket Detail — Detailed view with approval actions.
   ============================================================ */
import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pill, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { niceDate, dateRange } from '@/lib/date';
import type { TransferTicket, TransferTicketStatus, TransferTicketApprovalStep, TransferTicketHistoryEntry } from '@/types';
import { getTransferTicket, approveTransferTicket, rejectTransferTicket, cancelTransferTicket } from '@/api/transferTickets';

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

const STEP_ORDER: TransferTicketStatus[] = [
  'Pending Current Manager Approval',
  'Pending Current HR Approval',
  'Pending Target HR Approval',
  'Pending Target Manager Approval',
  'Approved',
];

function StepIndicator({ steps, currentStep, isCompleted }: { steps: TransferTicketStatus[]; currentStep: TransferTicketStatus; isCompleted: boolean }) {
  const currentIndex = steps.indexOf(currentStep);
  const isRejectedOrCancelled = ['Rejected', 'Cancelled'].includes(currentStep);

  return (
    <div className="step-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {steps.map((step, idx) => {
        const isCurrent = idx === currentIndex && !isCompleted && !isRejectedOrCancelled;
        const isPast = idx < currentIndex;
        const isFuture = idx > currentIndex;
        const stepData = steps.find(s => s === step);
        
        return (
          <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                background: isPast || isCurrent ? 'var(--color-primary)' : isCompleted ? 'var(--color-success)' : 'var(--color-bg-tertiary)',
                color: isPast || isCurrent || isCompleted ? 'white' : 'var(--color-text-muted)',
                border: isCurrent ? '2px solid var(--color-primary)' : 'none',
              }}
            >
              {isPast || isCompleted ? <Icon name="check" size={16} /> : String(idx + 1)}
            </div>
            <span style={{
              fontSize: 11,
              textAlign: 'center',
              maxWidth: 120,
              color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: isCurrent ? 600 : 400,
            }}>
              {step.replace('Pending ', '').replace(' Approval', '')}
            </span>
            {idx < steps.length - 1 && (
              <div style={{
                width: 60,
                height: 2,
                background: idx < currentIndex ? 'var(--color-primary)' : 'var(--color-border)',
                marginBottom: 20,
              }} />
            )}
          </div>
        );
      })}
      {isCompleted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={16} style={{ color: 'white' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600 }}>Completed</span>
        </div>
      )}
    </div>
  );
}

export function TransferTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<TransferTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getTransferTicket(id)
      .then(({ transferTicket }) => {
        if (!cancelled) setTicket(transferTicket);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load ticket');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const handleApprove = async () => {
    if (!ticket) return;
    setActionLoading('approve');
    try {
      const { transferTicket } = await approveTransferTicket(ticket.id, { reason: '' });
      setTicket(transferTicket);
      toast('Approved successfully', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to approve', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!ticket) return;
    const reason = window.prompt('Rejection reason (required):');
    if (!reason) return;
    setActionLoading('reject');
    try {
      const { transferTicket } = await rejectTransferTicket(ticket.id, { reason });
      setTicket(transferTicket);
      toast('Rejected', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reject', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!ticket) return;
    if (!window.confirm('Cancel this transfer request?')) return;
    const reason = window.prompt('Cancellation reason (optional):') || '';
    setActionLoading('cancel');
    try {
      const { transferTicket } = await cancelTransferTicket(ticket.id, { reason });
      setTicket(transferTicket);
      toast('Cancelled', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const userRoleInTicket = ticket ? (
    (() => {
      const userId = user?.id;
      if (!userId) return null;
      const tid = String(userId);
      if (ticket.currentManager && typeof ticket.currentManager === 'object' && ticket.currentManager.id === tid) return { role: 'MANAGER', type: 'current' };
      if (ticket.targetManager && typeof ticket.targetManager === 'object' && ticket.targetManager.id === tid) return { role: 'MANAGER', type: 'target' };
      if (ticket.currentHr && typeof ticket.currentHr === 'object' && ticket.currentHr.id === tid) return { role: 'HR', type: 'current' };
      if (ticket.targetHr && typeof ticket.targetHr === 'object' && ticket.targetHr.id === tid) return { role: 'HR', type: 'target' };
      if (ticket.requestedBy && typeof ticket.requestedBy === 'object' && ticket.requestedBy.id === tid) return { role: 'REQUESTER' };
      return null;
    })()
  ) : null;

  const isPending = ticket && ['Pending Current Manager Approval', 'Pending Current HR Approval', 'Pending Target HR Approval', 'Pending Target Manager Approval'].includes(ticket.status);
  const isRequester = userRoleInTicket?.role === 'REQUESTER';

  const canApprove = ticket && isPending && userRoleInTicket && (
    (ticket.status === 'Pending Current Manager Approval' && userRoleInTicket.type === 'current' && userRoleInTicket.role === 'MANAGER') ||
    (ticket.status === 'Pending Current HR Approval' && userRoleInTicket.type === 'current' && userRoleInTicket.role === 'HR') ||
    (ticket.status === 'Pending Target HR Approval' && userRoleInTicket.type === 'target' && userRoleInTicket.role === 'HR') ||
    (ticket.status === 'Pending Target Manager Approval' && userRoleInTicket.type === 'target' && userRoleInTicket.role === 'MANAGER')
  );

  const canReject = canApprove;
  const canCancel = ticket && isRequester && isPending;

  if (loading) {
    return (
      <div className="grid">
        <section className="card span12">
          <div className="empty-state" style={{ padding: 48 }}>
            <span className="loader" style={{ width: 32, height: 32 }} />
            <p>Loading ticket…</p>
          </div>
        </section>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="grid">
        <section className="card span12">
          <div className="card" style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)', padding: 24, textAlign: 'center' }}>
            <Icon name="alertTriangle" size={32} style={{ color: 'var(--color-danger)', marginBottom: 12 }} />
            <h3>Ticket Not Found</h3>
            <p>{error || 'The transfer ticket could not be loaded.'}</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>Go Back</button>
          </div>
        </section>
      </div>
    );
  }

  const currentStepIndex = STEP_ORDER.indexOf(ticket.currentStep);
  const activeSteps = STEP_ORDER.slice(0, currentStepIndex + 1);
  const isCompleted = ['Approved', 'Completed'].includes(ticket.status);

  const emp = typeof ticket.employee === 'object' ? ticket.employee : null;
  const currentMgr = typeof ticket.currentManager === 'object' ? ticket.currentManager : null;
  const targetMgr = typeof ticket.targetManager === 'object' ? ticket.targetManager : null;
  const currentHr = typeof ticket.currentHr === 'object' ? ticket.currentHr : null;
  const targetHr = typeof ticket.targetHr === 'object' ? ticket.targetHr : null;
  const requester = typeof ticket.requestedBy === 'object' ? ticket.requestedBy : null;

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>{ticket.ticketNumber}</h2>
            <div className="sub">Employee Transfer Request — {emp?.fullName || 'Unknown'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill status={STATUS_COLORS[ticket.status] as any}>{ticket.status}</Pill>
            {canApprove && (
              <>
                <button className="btn btn-success" onClick={handleApprove} disabled={actionLoading === 'approve'}>
                  {actionLoading === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button className="btn btn-danger" onClick={handleReject} disabled={actionLoading === 'reject'}>
                  {actionLoading === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </>
            )}
            {canCancel && (
              <button className="btn btn-ghost" onClick={handleCancel} disabled={actionLoading === 'cancel'}>
                {actionLoading === 'cancel' ? 'Cancelling…' : 'Cancel Request'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              <Icon name="arrowLeft" size={16} /> Back
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <StepIndicator steps={activeSteps} currentStep={ticket.currentStep} isCompleted={isCompleted} />
        </div>

        <div className="grid" style={{ marginTop: 16 }}>
          <section className="card span6">
            <h3 style={{ marginBottom: 16 }}>Employee Details</h3>
            <dl className="detail-list">
              <div><dt>Name</dt><dd>{emp?.fullName || '—'}</dd></div>
              <div><dt>Employee ID</dt><dd>{emp?.employeeId || '—'}</dd></div>
              <div><dt>Department</dt><dd>{emp?.department || '—'}</dd></div>
              <div><dt>Designation</dt><dd>{emp?.designation || '—'}</dd></div>
            </dl>
          </section>

          <section className="card span6">
            <h3 style={{ marginBottom: 16 }}>Transfer Details</h3>
            <dl className="detail-list">
              <div><dt>Reason</dt><dd>{ticket.reason}</dd></div>
              <div><dt>Business Justification</dt><dd>{ticket.businessJustification || '—'}</dd></div>
              <div><dt>Requested Effective Date</dt><dd>{niceDate(ticket.requestedEffectiveDate)}</dd></div>
              <div><dt>Supporting Document</dt><dd>{ticket.supportingDocument || '—'}</dd></div>
            </dl>
          </section>

          <section className="card span6">
            <h3 style={{ marginBottom: 16 }}>Current Assignment</h3>
            <dl className="detail-list">
              <div><dt>Manager</dt><dd>{currentMgr ? `${currentMgr.fullName} (${currentMgr.employeeId})` : ticket.currentManagerEmployeeId || '—'}</dd></div>
              <div><dt>HR</dt><dd>{currentHr ? `${currentHr.fullName} (${currentHr.employeeId})` : ticket.currentHrEmployeeId || '—'}</dd></div>
            </dl>
          </section>

          <section className="card span6">
            <h3 style={{ marginBottom: 16 }}>Target Assignment</h3>
            <dl className="detail-list">
              <div><dt>Manager</dt><dd>{targetMgr ? `${targetMgr.fullName} (${targetMgr.employeeId})` : ticket.targetManagerEmployeeId || '—'}</dd></div>
              <div><dt>HR</dt><dd>{targetHr ? `${targetHr.fullName} (${targetHr.employeeId})` : ticket.targetHrEmployeeId || '—'}</dd></div>
            </dl>
          </section>

          <section className="card span6">
            <h3 style={{ marginBottom: 16 }}>Requester</h3>
            <dl className="detail-list">
              <div><dt>Name</dt><dd>{requester ? `${requester.fullName} (${requester.employeeId})` : ticket.requestedBy as string}</dd></div>
              <div><dt>Role</dt><dd>{ticket.requestedByRole}</dd></div>
              <div><dt>Requested On</dt><dd>{niceDate(ticket.createdAt)}</dd></div>
            </dl>
          </section>

          <section className="card span6">
            <h3 style={{ marginBottom: 16 }}>Timestamps</h3>
            <dl className="detail-list">
              <div><dt>Created</dt><dd>{niceDate(ticket.createdAt)}</dd></div>
              <div><dt>Updated</dt><dd>{niceDate(ticket.updatedAt)}</dd></div>
              {ticket.approvedAt && <div><dt>Approved</dt><dd>{niceDate(ticket.approvedAt)}</dd></div>}
              {ticket.completedAt && <div><dt>Completed</dt><dd>{niceDate(ticket.completedAt)}</dd></div>}
              {ticket.rejectedAt && <div><dt>Rejected</dt><dd>{niceDate(ticket.rejectedAt)}</dd></div>}
              {ticket.cancelledAt && <div><dt>Cancelled</dt><dd>{niceDate(ticket.cancelledAt)}</dd></div>}
            </dl>
          </section>
        </div>

        {/* Approval Steps */}
        <section className="card span12" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 16 }}>Approval Workflow</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '8px 12px' }}>Step</th>
                  <th style={{ padding: '8px 12px' }}>Approver</th>
                  <th style={{ padding: '8px 12px' }}>Role</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Decided</th>
                  <th style={{ padding: '8px 12px' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {ticket.approvalSteps.map((step, idx) => (
                  <tr key={step.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: step.step === ticket.currentStep && !['Approved', 'Rejected', 'Cancelled', 'Completed'].includes(ticket.status) ? 600 : 400 }}>
                      {step.step.replace('Pending ', '').replace(' Approval', '')}
                      {step.isSkipped && <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>Skipped</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {step.assignedTo && typeof step.assignedTo === 'object' 
                        ? `${step.assignedTo.fullName} (${step.assignedTo.employeeId})`
                        : step.assignedTo || '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{step.approverRole}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {step.isSkipped ? (
                        <Pill status="muted">Skipped</Pill>
                      ) : step.decidedBy ? (
                        <Pill status={step.decision === 'Approved' ? 'success' : 'danger'}>
                          {step.decision}
                        </Pill>
                      ) : (
                        <Pill status="warn">Pending</Pill>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {step.decidedAt ? niceDate(step.decidedAt) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)', fontSize: 12 }}>
                      {step.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* History */}
        <section className="card span12" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 16 }}>History</h3>
          {ticket.history.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No history entries.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ticket.history.slice().reverse().map((entry, idx) => (
                <div key={entry.id || idx} className="history-entry" style={{ padding: 12, background: 'var(--color-bg-tertiary)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{entry.action}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{niceDate(entry.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {entry.details}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    By: {entry.performedBy && typeof entry.performedBy === 'object' 
                      ? `${entry.performedBy.fullName} (${entry.performedByRole})`
                      : entry.performedBy}
                    {entry.fromStatus && entry.toStatus && (
                      <> | {entry.fromStatus} → {entry.toStatus}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

export default TransferTicketDetailPage;