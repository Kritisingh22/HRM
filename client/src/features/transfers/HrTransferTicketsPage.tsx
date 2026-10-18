/* ============================================================
   Transfer Tickets — HR portal for reviewing employee transfer requests.
   
   Tabs: Awaiting My Approval, All Tickets
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { ResourceView, type FilterDef } from '@/components/ui/ResourceView';
import { EmpCell, Pill, Tabs } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { niceDate } from '@/lib/date';
import type { TransferTicket, TransferTicketStatus } from '@/types';
import { listTransferTickets, getTransferTicket, approveTransferTicket, rejectTransferTicket } from '@/api/transferTickets';

type TabKey = 'awaiting-approval' | 'all';

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

export function HrTransferTicketsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>('awaiting-approval');
  const [tickets, setTickets] = useState<TransferTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const statusFilter = tab === 'awaiting-approval'
      ? 'Pending Current HR Approval'
      : undefined;

    listTransferTickets({ status: statusFilter })
      .then(({ transferTickets }) => {
        if (!cancelled) {
          let filtered = transferTickets;
          if (tab === 'awaiting-approval') {
            filtered = transferTickets.filter(t => 
              (t.currentHr && typeof t.currentHr === 'object' && t.currentHr.id === user?.employeeId) ||
              (t.targetHr && typeof t.targetHr === 'object' && t.targetHr.id === user?.employeeId)
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
    { header: 'Current Step', render: (t: TransferTicket) => t.currentStep },
    { header: 'Requested', render: (t: TransferTicket) => <span className="num">{niceDate(t.createdAt)}</span> },
    { header: 'Effective Date', render: (t: TransferTicket) => <span className="num">{niceDate(t.requestedEffectiveDate)}</span> },
  ], []);

  const tabs: Array<{ key: TabKey; label: string }> = [
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
  };

  const ticketActions = (t: TransferTicket) => {
    const actions: Array<{ key: string; label: string; variant?: 'ghost' | 'danger' }> = [];
    
    actions.push({ key: 'view', label: 'View', variant: 'ghost' });

    const isCurrentHr = t.currentHr && typeof t.currentHr === 'object' && t.currentHr.id === user?.employeeId;
    const isTargetHr = t.targetHr && typeof t.targetHr === 'object' && t.targetHr.id === user?.employeeId;
    const isPending = ['Pending Current Manager Approval', 'Pending Current HR Approval', 'Pending Target HR Approval', 'Pending Target Manager Approval'].includes(t.status);

    if (isPending) {
      if ((t.status === 'Pending Current HR Approval' && isCurrentHr) ||
          (t.status === 'Pending Target HR Approval' && isTargetHr)) {
        actions.push({ key: 'approve', label: 'Approve' });
        actions.push({ key: 'reject', label: 'Reject', variant: 'danger' });
      }
    }

    return actions;
  };

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Employee Transfer Requests</h2>
            <div className="sub">Review and approve/reject employee transfer requests</div>
          </div>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {error && (
          <div className="card" style={{ marginTop: 16, borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)' }}>
            <span style={{ color: 'var(--color-danger)' }}>{error}</span>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <span className="loader" style={{ width: 32, height: 32 }} />
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

export default HrTransferTicketsPage;