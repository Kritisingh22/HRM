/* ============================================================
   Leave request details — the dialog behind every calendar event,
   team panel row and agenda entry.

   Renders the stored record only (no invented fields) and offers
   the actions the viewer is allowed to take: owners can cancel a
   pending request and jump to its row in the history table;
   managers and HR get a shortcut to the approval queue.
   ============================================================ */
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { teamIds } from '@/lib/lookups';
import { LEAVE_STATUS_COLORS } from '@/lib/attendance';
import { dateRange, niceDate, stampText } from '@/lib/date';
import type { LeaveRequest } from '@/types';

interface LeaveRequestModalProps {
  request: LeaveRequest;
  onClose: () => void;
  /** scroll the owner's history table to this request */
  onShowInList?: (id: string) => void;
  /** jump to the approval queue (managers / HR, pending only) */
  onOpenApprovals?: () => void;
  /** owner's cancel action for a pending request */
  onCancel?: (request: LeaveRequest) => void;
}

export function LeaveRequestModal({
  request,
  onClose,
  onShowInList,
  onOpenApprovals,
  onCancel,
}: LeaveRequestModalProps) {
  const { data } = useApp();
  const { user } = useAuth();
  const myId = user?.employeeId ?? '';
  const isOwner = Boolean(myId) && request.employeeId === myId;
  const employee = data.employees.find((e) => e.id === request.employeeId);

  /* Decision rights mirror the backend policy: HR decides everything,
     a manager only their own reporting line, and nobody their own
     request. The queue itself re-checks the transition on save. */
  const inManagerScope = Boolean(
    user?.portal === 'manager' && myId && teamIds(data.employees, myId).has(request.employeeId),
  );
  const canDecide =
    !isOwner && request.status === 'Pending' && (user?.portal === 'hr' || inManagerScope);

  return (
    <Modal
      title={`Leave Request — ${request.id}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Close
          </button>
          {isOwner && onShowInList ? (
            <button className="btn btn-outline" onClick={() => onShowInList(request.id)} type="button">
              Show in my requests
            </button>
          ) : null}
          {canDecide && onOpenApprovals ? (
            <button
              className="btn btn-outline"
              onClick={() => {
                onClose();
                onOpenApprovals();
              }}
              type="button"
            >
              Open Leave Approvals
            </button>
          ) : null}
          {isOwner && request.status === 'Pending' && onCancel ? (
            <button className="btn btn-danger-outline" onClick={() => onCancel(request)} type="button">
              Cancel request
            </button>
          ) : null}
        </>
      }
    >
      <div className="detail-grid" style={{ marginBottom: 14 }}>
        <dt>Employee</dt>
        <dd>
          {employee?.name ?? request.employeeId}
          {isOwner ? ' (you)' : ''} · <span className="num">{request.employeeId}</span>
        </dd>
        <dt>Type</dt>
        <dd>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span className="cal-dot" style={{ background: LEAVE_STATUS_COLORS[request.status] }} />
            {request.type}
            {request.halfDay ? ' · Half day' : ''}
          </span>
        </dd>
        <dt>Dates</dt>
        <dd>
          {dateRange(request.from, request.to)} · {request.days} day{request.days === 1 ? '' : 's'}
        </dd>
        <dt>Applied on</dt>
        <dd>{niceDate(request.appliedOn)}</dd>
        <dt>Reason</dt>
        <dd>{request.reason || '—'}</dd>
        {request.emergencyContact ? (
          <>
            <dt>Emergency contact</dt>
            <dd>{request.emergencyContact}</dd>
          </>
        ) : null}
        <dt>Status</dt>
        <dd>
          <Pill status={request.status} />
          {request.decidedAt ? (
            <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>
              {request.status === 'Cancelled' ? 'Cancelled' : 'Decided'} {stampText(request.decidedAt)}
            </span>
          ) : null}
        </dd>
        <dt>Manager note</dt>
        <dd>{request.managerNote || '—'}</dd>
      </div>
      {canDecide ? (
        <div className="info-note">
          Pending decision — approve or reject it from Leave Approvals; the calendar updates instantly.
        </div>
      ) : null}
    </Modal>
  );
}
