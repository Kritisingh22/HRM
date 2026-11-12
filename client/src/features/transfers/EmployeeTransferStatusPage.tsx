/* ============================================================
   Transfer Status — Employee portal for viewing own transfer requests.
   ============================================================ */
import { useEffect, useState } from 'react';
import { ResourceView } from '@/components/ui/ResourceView';
import { EmpCell, Pill, type DetailRow } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { niceDate } from '@/lib/date';
import type { TransferTicket, TransferTicketStatus } from '@/types';
import { listTransferTickets } from '@/api/transferTickets';

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

export function EmployeeTransferStatusPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TransferTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listTransferTickets()
      .then(({ transferTickets }) => {
        if (!cancelled) {
          // Filter to only tickets where this employee is the subject
          const myTickets = transferTickets.filter(t => {
            const emp = typeof t.employee === 'object' ? t.employee : null;
            return emp?.id === user?.employeeId || emp?.employeeId === user?.employeeId;
          });
          setTickets(myTickets);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load transfer requests');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.employeeId]);

  const ticketColumns = [
    { header: 'Ticket #', render: (t: TransferTicket) => <span className="num">{t.ticketNumber}</span> },
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
    { header: 'Current Step', render: (t: TransferTicket) => t.currentStep },
    { header: 'Requested', render: (t: TransferTicket) => <span className="num">{niceDate(t.createdAt)}</span> },
    { header: 'Effective Date', render: (t: TransferTicket) => <span className="num">{niceDate(t.requestedEffectiveDate)}</span> },
  ];

  if (loading) {
    return (
      <div className="grid">
        <section className="card span12">
          <div className="card-head">
            <h2>My Transfer Requests</h2>
            <div className="sub">View the status of your employee transfer requests</div>
          </div>
          <div className="empty-state" style={{ padding: 48 }}>
            <span className="loader" style={{ width: 32, height: 32 }} />
            <p>Loading…</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <h2>My Transfer Requests</h2>
          <div className="sub">View the status of your employee transfer requests</div>
        </div>

        {error && (
          <div className="card" style={{ marginTop: 16, borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)' }}>
            <span style={{ color: 'var(--color-danger)' }}>{error}</span>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {tickets.length === 0 ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 16 }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <h3 style={{ margin: '0 0 8px' }}>No transfer requests</h3>
              <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>You don't have any active or past transfer requests.</p>
            </div>
          ) : (
            <ResourceView
              rows={tickets}
              rowId={(t) => t.id}
              columns={ticketColumns}
              search={(t) => `${t.ticketNumber} ${t.currentManagerEmployeeId} ${t.targetManagerEmployeeId}`}
              detail={(t): DetailRow[] => [
                'Transfer Request',
                ['Ticket Number', t.ticketNumber],
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
                ...(t.rejectionReason ? [['Rejection Reason', t.rejectionReason] as DetailRow] : []),
                ...(t.cancellationReason ? [['Cancellation Reason', t.cancellationReason] as DetailRow] : []),
              ]}
              emptyText="No transfer requests found."
              emptyIcon="arrowRightLeft"
            />
          )}
        </div>
      </section>
    </div>
  );
}

export default EmployeeTransferStatusPage;