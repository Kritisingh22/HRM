/* ============================================================
   Leave Approvals — the decision queue for HR, Managers, Admins and Super Admins.

   Approve or reject pending requests with a note; decisions flow
   straight into the leave calendar and attendance register.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmpCell, EmptyState, Pill, StatRow, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { teamIds } from '@/lib/lookups';
import { LEAVE_TYPES, requestOn } from '@/lib/attendance';
import { dateRange, niceDate, stampText, todayISO } from '@/lib/date';
import type { LeaveRequest } from '@/types';

// role constants for this page
const HR_PORTAL = 'hr';
const MANAGER_PORTAL = 'manager';

export function LeaveApprovalsPage() {
  const { data, dispatch, audit, notify } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();
  const myId = user?.employeeId ?? '';
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deciding, setDeciding] = useState<LeaveRequest | null>(null);
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState('');

  // Helper: get all employee IDs visible to this user based on their role/scope
  const scopeIds = useMemo(() => {
    if (user?.portal === 'manager' && myId) return teamIds(data.employees, myId);
    // HR sees all employees in their scope; Admin/Super Admin see all
    return null;
  }, [user?.portal, myId, data.employees]);

  const inScope = (r: LeaveRequest) => scopeIds === null || scopeIds.has(r.employeeId);

  // Check if the current user is authorized to decide this request based on
  // approvalAuthority and user role/portal.
  const canDecideRequest = (r: LeaveRequest) => {
    if (r.status !== 'Pending') return false;
    if (!inScope(r)) return false;

    const isHRPortal = user?.portal === HR_PORTAL;
    const isManagerPortal = user?.portal === MANAGER_PORTAL;

    // --- Super Admin can decide any pending request ---
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    // --- Admin can decide any pending request (except their own, which needs Super Admin) ---
    if (user?.role === 'ADMIN') {
      // Prevent admin from approving their own leave
      if (String(leaveApplicantUserId(r)) === String(user?._id)) return false;
      return true;
    }

    // --- HR portal user ---
    if (isHRPortal) {
      if (r.approvalAuthority === 'HR') {
        // Only HR can approve HR-assigned requests
        return true;
      } else if (r.approvalAuthority === 'Manager') {
        // HR can also approve Manager-authorized requests
        return true;
      } else if (r.approvalAuthority === 'Admin') {
        // HR can approve Admin-authorized requests (delegated)
        return true;
      }
      // Super Admin-authorized requests are handled by SUPER_ADMIN role check above
      return false;
    }

    // --- Manager portal user ---
    if (isManagerPortal) {
      if (r.approvalAuthority === 'Manager') {
        // Only the assigned manager can approve/reject manager-assigned requests.
        // inScope() above already confirms the employee is in this manager's team.
        return true;
      }
      // Managers cannot approve HR, Admin or Super Admin authorized requests
      return false;
    }

    // Employee portal - no approval rights
    return false;
  };

  // Extract applicantUserId from leave request for self-checks.
  // `applicantUserId` is not part of the shared LeaveRequest type, so read it
  // through a partial cast when present in the request payload.
  const leaveApplicantUserId = (r: LeaveRequest) => (r as Partial<{ applicantUserId?: string }>).applicantUserId || '';
  const applicantRoleFor = (r: LeaveRequest) => (r as Partial<{ applicantRole?: string }>).applicantRole || 'Employee';

  /* Per-employee leave allowances are not stored yet, so the decision
     modal shows what the records prove: approved (non-WFH) days in the
     current calendar year. */
  const approvedDaysThisYear = (employeeId: string) => {
    const year = todayISO().slice(0, 4);
    return data.leaveRequests
      .filter(
        (r) =>
          r.employeeId === employeeId &&
          r.status === 'Approved' &&
          r.type !== 'Work From Home' &&
          r.from.slice(0, 4) === year,
      )
      .reduce((sum, r) => sum + r.days, 0);
  };

  const pending = useMemo(
    () =>
      data.leaveRequests
        .filter((r) => r.status === 'Pending' && inScope(r) && canDecideRequest(r))
        .filter((r) => typeFilter === 'all' || r.type === typeFilter)
        .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1)),
    [data.leaveRequests, scopeIds, typeFilter, user?.portal, myId],
  );

  const decided = useMemo(
    () =>
      data.leaveRequests
        .filter((r) => r.status !== 'Pending' && inScope(r))
        .filter((r) => typeFilter === 'all' || r.type === typeFilter)
        .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1))
        .slice(0, 40),
    [data.leaveRequests, scopeIds, typeFilter],
  );

  const employeesOnLeaveToday = useMemo(
    () =>
      data.employees.filter((e) => {
        if (scopeIds && !scopeIds.has(e.id)) return false;
        return data.leaveRequests.some(
          (r) => r.employeeId === e.id && r.status === 'Approved' && r.type !== 'Work From Home' && todayISO() >= r.from && todayISO() <= r.to,
        );
      }),
    [data.employees, data.leaveRequests, scopeIds],
  );

  const openDecision = (r: LeaveRequest, ok: boolean) => {
    setDeciding(r);
    setApprove(ok);
    setNote('');
  };

  const saveDecision = () => {
    if (!deciding) return;
    const status = approve ? 'Approved' : 'Rejected';
    // A rejection requires a reason.
    if (status === 'Rejected' && !note.trim()) {
      toast('A rejection reason is required.', 'error');
      return;
    }
    dispatch({
      type: 'update',
      collection: 'leaveRequests',
      id: deciding.id,
      patch: { status, rejectionReason: note.trim() || undefined, decidedAt: new Date().toISOString() },
    });
    const emp = data.employees.find((e) => e.id === deciding.employeeId);
    audit(`Leave ${status.toLowerCase()}`, deciding.id);
    notify(`${emp?.name ?? deciding.employeeId}'s ${deciding.type} (${deciding.id}) was ${status.toLowerCase()}`);
    toast(`${deciding.id} ${status.toLowerCase()} for ${emp?.name ?? 'employee'}.`, approve ? 'success' : 'info');
    setDeciding(null);
  };

  const rowsShown = tab === 'pending' ? pending : decided;

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Leave Approvals</h2>
            <div className="sub">
              {user?.portal === 'manager'
                ? 'Requests from your reporting line'
                : user?.role === 'ADMIN'
                  ? 'All pending employee requests awaiting approval'
                  : user?.role === 'SUPER_ADMIN'
                    ? 'All pending employee requests (centralized approval)'
                    : 'All pending employee requests'}
            </div>
          </div>
          <div className="tools">
            <span className="chip">{pending.length} awaiting decision</span>
            <span className="chip">{employeesOnLeaveToday.length} on leave today</span>
          </div>
        </div>

        <StatRow
          items={[
            { k: 'Pending', v: pending.length, s: 'in your scope' },
            { k: 'Approved', v: data.leaveRequests.filter((r) => r.status === 'Approved' && inScope(r)).length },
            { k: 'Rejected', v: data.leaveRequests.filter((r) => r.status === 'Rejected' && inScope(r)).length },
            { k: 'On leave today', v: employeesOnLeaveToday.length },
            {
              k: 'Avg request',
              v: `${pending.length ? Math.round((pending.reduce((s, r) => s + r.days, 0) / pending.length) * 10) / 10 : 0} d`,
              s: 'pending days',
            },
          ]}
        />

        <Tabs
          tabs={[
            { key: 'pending', label: `Pending (${pending.length})` },
            { key: 'decided', label: `Decided (${decided.length})` },
          ]}
          active={tab}
          onChange={(k) => setTab(k as 'pending' | 'decided')}
        />

        <div className="toolbar" style={{ marginTop: 14 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Leave type filter">
            <option value="all">All leave types</option>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="chip">{tab === 'pending' ? 'Oldest first once decided' : 'Showing latest 40'}</span>
        </div>

        {rowsShown.length === 0 ? (
          <EmptyState
            icon="clipboardCheck"
            title={tab === 'pending' ? 'No pending requests' : 'No decisions yet'}
            sub={tab === 'pending' ? 'Everything in your scope has been decided. Nice.' : 'Approved and rejected requests will appear here.'}
          />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Applicant Role</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Applied</th>
                  <th>Authority</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rowsShown.map((r) => {
                  const emp = data.employees.find((e) => e.id === r.employeeId);
                  const canDecide = r.status === 'Pending' && canDecideRequest(r);
                  const applicantRole = applicantRoleFor(r);

                  return (
                    <tr key={r.id}>
                      <td>
                        <EmpCell name={emp?.name ?? r.employeeId} sub={emp?.designation ?? ''} seed={r.employeeId} />
                      </td>
                      <td>
                        {emp?.employeeId ?? r.employeeId}
                      </td>
                      <td>
                        {emp?.department ?? ''}
                      </td>
                      <td>
                        {emp?.designation ?? ''}
                      </td>
                      <td>
                        <span className="chip" style={{
                          background: applicantRole === 'HR' ? 'var(--blue-tint)' : applicantRole === 'Admin' ? 'var(--amber-tint)' : applicantRole === 'Super Admin' ? 'var(--red-tint)' : 'var(--teal-tint)',
                          color: applicantRole === 'HR' ? 'var(--blue)' : applicantRole === 'Admin' ? 'var(--orange)' : applicantRole === 'Super Admin' ? 'var(--white)' : 'var(--teal)'
                        }}>
                          {applicantRole}
                        </span>
                      </td>
                      <td>
                        {r.type}
                        {r.halfDay ? <span className="chip" style={{ marginLeft: 8 }}>Half day</span> : null}
                      </td>
                      <td className="num">{dateRange(r.from, r.to)}</td>
                      <td className="num">{r.days}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 240 }}>{r.reason || '—'}</td>
                      <td className="num">{niceDate(r.appliedOn)}</td>
                      <td>
                        <span className="chip" style={{
                          background: r.approvalAuthority === 'HR' ? 'var(--blue-tint)' : r.approvalAuthority === 'Admin' ? 'var(--amber-tint)' : r.approvalAuthority === 'Super Admin' ? 'var(--red-tint)' : 'var(--teal-tint)',
                          color: r.approvalAuthority === 'HR' ? 'var(--blue)' : r.approvalAuthority === 'Admin' ? 'var(--orange)' : r.approvalAuthority === 'Super Admin' ? 'var(--white)' : 'var(--teal)'
                        }}>
                          {r.approvalAuthority}
                        </span>
                      </td>
                      <td>
                        <Pill status={r.status} />
                      </td>
                      <td>
                        {canDecide ? (
                          <div className="act-btns">
                            <button className="btn btn-outline btn-sm" onClick={() => openDecision(r, true)} type="button">
                              Approve
                            </button>
                            <button className="btn btn-danger-outline btn-sm" onClick={() => openDecision(r, false)} type="button">
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                            {r.managerNote || '—'}
                            {r.decidedAt ? (
                              <>
                                <br />
                                {r.status === 'Cancelled' ? 'Cancelled' : 'Decided'} {stampText(r.decidedAt)}
                              </>
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-foot">
          Working-day counting skips weekends and holidays; approved leave feeds the attendance register immediately.
        </div>
      </section>

      {deciding ? (() => {
        const decidingApplicantRole = applicantRoleFor(deciding);
        return (
          <Modal
            title={approve ? `Approve ${deciding.id}` : `Reject ${deciding.id}`}
            onClose={() => setDeciding(null)}
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setDeciding(null)} type="button">
                  Cancel
                </button>
                <button className={approve ? 'btn btn-primary' : 'btn btn-danger-outline'} onClick={saveDecision} type="button">
                  {approve ? 'Approve request' : 'Reject request'}
                </button>
              </>
            }
          >
            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <dt>Employee</dt>
              <dd>{data.employees.find((e) => e.id === deciding.employeeId)?.name ?? deciding.employeeId}</dd>
              <dt>Employee ID</dt>
              <dd>{data.employees.find((e) => e.id === deciding.employeeId)?.employeeId ?? deciding.employeeId}</dd>
              <dt>Department</dt>
              <dd>{data.employees.find((e) => e.id === deciding.employeeId)?.department ?? ''}</dd>
              <dt>Designation</dt>
              <dd>{data.employees.find((e) => e.id === deciding.employeeId)?.designation ?? ''}</dd>
              <dt>Applicant Role</dt>
              <dd>
                <span className="chip" style={{
                  background: decidingApplicantRole === 'HR' ? 'var(--blue-tint)' : decidingApplicantRole === 'Admin' ? 'var(--amber-tint)' : decidingApplicantRole === 'Super Admin' ? 'var(--red-tint)' : 'var(--teal-tint)',
                  color: decidingApplicantRole === 'HR' ? 'var(--blue)' : decidingApplicantRole === 'Admin' ? 'var(--orange)' : decidingApplicantRole === 'Super Admin' ? 'var(--white)' : 'var(--teal)'
                }}>
                  {decidingApplicantRole}
                </span>
              </dd>
              <dt>Type</dt>
              <dd>{deciding.type}</dd>
              <dt>Dates</dt>
              <dd>
                {niceDate(deciding.from)}
                {deciding.to !== deciding.from ? ` – ${niceDate(deciding.to)}` : ''} · {deciding.days} day{deciding.days === 1 ? '' : 's'}
              </dd>
              <dt>Reason</dt>
              <dd>{deciding.reason || '—'}</dd>
              <dt>Applied on</dt>
              <dd>{niceDate(deciding.appliedOn)}</dd>
              <dt>Authority</dt>
              <dd>
                <span className="chip" style={{
                  background: deciding.approvalAuthority === 'HR' ? 'var(--blue-tint)' : deciding.approvalAuthority === 'Admin' ? 'var(--amber-tint)' : deciding.approvalAuthority === 'Super Admin' ? 'var(--red-tint)' : 'var(--teal-tint)',
                  color: deciding.approvalAuthority === 'HR' ? 'var(--blue)' : deciding.approvalAuthority === 'Admin' ? 'var(--orange)' : deciding.approvalAuthority === 'Super Admin' ? 'var(--white)' : 'var(--teal)'
                }}>
                  {deciding.approvalAuthority}
                </span>
              </dd>
              <dt>On approved leave</dt>
              <dd>{approvedDaysThisYear(deciding.employeeId)} day(s) this year, from records</dd>
            </div>
            <div className="info-note" style={{ marginBottom: 14 }}>
              {deciding.type === 'Work From Home'
                ? 'WFH approvals do not count against the leave balance.'
                : requestOn(data.leaveRequests, deciding.employeeId, deciding.from)?.id === deciding.id
                  ? 'This request covers the selected dates on the employee’s calendar.'
                  : 'Check overlap with existing approved leave before deciding.'}
            </div>
            <div className="field">
              <label htmlFor="lv-note">{approve ? 'Note (optional)' : 'Reason for rejection'}</label>
              <textarea
                id="lv-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={approve ? 'e.g. Approved — handover to Karan' : 'e.g. Release week — please reschedule'}
              />
            </div>
            {!approve ? (
              <div className="info-note">
                <Icon name="alertTriangle" size={14} /> A rejection lets the employee re-apply for different dates.
              </div>
            ) : null}
          </Modal>
        );
      })() : null}
    </div>
  );
}