/* ============================================================
   Apply for Leave — validated form.

   Rules (mirrored from the original preview):
   • leave can be applied for today or future dates only
   • start ≤ end, and half day applies to a single date
   • the range must contain at least one working day
   • the range may not overlap a Pending / Approved request
   ============================================================ */
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { isApiSession } from '@/api/client';
import { API_LEAVE_TYPES } from '@/api/realMap';
import { LEAVE_TYPES, countWorkingDays, requestOn } from '@/lib/attendance';
import { todayISO } from '@/lib/date';

interface ApplyLeaveModalProps {
  presetDate?: string;
  onClose: () => void;
}

export function ApplyLeaveModal({ presetDate, onClose }: ApplyLeaveModalProps) {
  const { data, dispatch, nextId, audit, notify } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();

  const myId = user?.employeeId ?? '';
  const me = data.employees.find((e) => e.id === myId);
  const today = todayISO();
  const initial = presetDate && presetDate >= today ? presetDate : today;

  const [type, setType] = useState('');
  const [from, setFrom] = useState(initial);
  const [to, setTo] = useState(initial);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [approvalAuthority, setApprovalAuthority] = useState<'Manager' | 'HR' | 'Admin' | 'Super Admin'>('Manager');
  const [errors, setErrors] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});

  const workDays = useMemo(
    () => (from && to && from <= to ? countWorkingDays(from, to, data.holidays) : 0),
    [from, to, data.holidays],
  );

  const submit = () => {
    const problems: string[] = [];
    const bad: Record<string, boolean> = {};

    if (!type) {
      problems.push('Select a leave type.');
      bad.type = true;
    }
    if (!from) {
      problems.push('Pick a start date.');
      bad.from = true;
    }
    if (!to) {
      problems.push('Pick an end date.');
      bad.to = true;
    }
    if (from && to && from > to) {
      problems.push('Start date cannot be after the end date.');
      bad.from = true;
      bad.to = true;
    }
    if (from && from < today) {
      problems.push('Leave can only be applied for today or future dates.');
      bad.from = true;
    }
    if (halfDay && from !== to) {
      problems.push('Half day applies to a single date — set the same start and end date.');
      bad.to = true;
    }
    if (!reason.trim()) {
      problems.push('Reason cannot be empty.');
      bad.reason = true;
    }
    if (from && to && from <= to) {
      if (workDays === 0) problems.push('The selected dates fall only on weekends or holidays.');
      const overlap = data.leaveRequests.find(
        (r) =>
          r.employeeId === myId &&
          (r.status === 'Pending' || r.status === 'Approved') &&
          from <= r.to &&
          to >= r.from,
      );
      if (overlap) problems.push(`These dates overlap with request ${overlap.id} (${overlap.status}).`);
      const existing = requestOn(data.leaveRequests, myId, from);
      if (existing && existing.status === 'Approved' && type === 'Work From Home') {
        problems.push(`You already have an approved ${existing.type} on ${from}.`);
      }
    }

    setInvalid(bad);
    setErrors(problems);
    if (problems.length) return;

    const id = nextId('LR', 4);
    dispatch({
      type: 'add',
      collection: 'leaveRequests',
      prepend: true,
      item: {
        id,
        employeeId: myId,
        type,
        from,
        to,
        days: halfDay ? 0.5 : workDays,
        halfDay,
        reason: reason.trim(),
        emergencyContact: contact.trim(),
        appliedOn: today,
        status: 'Pending' as const,
        managerNote: '',
        approvalAuthority,
      },
    });
    audit('Leave requested', id, me?.name ?? 'Employee');
    notify(`${me?.name ?? 'An employee'} applied for ${type} (${from}${to !== from ? ` – ${to}` : ''})`);
    toast(`Leave request ${id} submitted — pending approval`, 'success');
    onClose();
  };

  return (
    <Modal
      title="Apply for Leave"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} type="button">
            Submit Leave Request
          </button>
        </>
      }
    >
      <div className="form-2col">
        <div className="field">
          <label htmlFor="alName">Employee name</label>
          <input id="alName" value={me?.name ?? ''} disabled />
        </div>
        <div className="field">
          <label htmlFor="alId">Employee ID</label>
          <input id="alId" value={myId} disabled />
        </div>
      </div>

      <div className={`field${invalid.type ? ' invalid' : ''}`}>
        <label htmlFor="alType">Leave type</label>
        <select id="alType" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Select leave type…</option>
          {/* Real sessions can only file the types the server's Leave
              model accepts; demo sessions keep the full catalogue. */}
          {(isApiSession() ? API_LEAVE_TYPES : LEAVE_TYPES).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="err">Please select a leave type.</div>
      </div>

      <div className="form-2col">
        <div className={`field${invalid.from ? ' invalid' : ''}`}>
          <label htmlFor="alFrom">Start date</label>
          <input
            id="alFrom"
            type="date"
            min={today}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to || to < e.target.value) setTo(e.target.value);
            }}
          />
          <div className="err">Pick a valid start date.</div>
        </div>
        <div className={`field${invalid.to ? ' invalid' : ''}`}>
          <label htmlFor="alTo">End date</label>
          <input id="alTo" type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="err">Pick a valid end date.</div>
        </div>
      </div>

      <label className="check-row">
        <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
        Half day (single-day leave only)
      </label>

      <div className={`field${invalid.reason ? ' invalid' : ''}`}>
        <label htmlFor="alReason">Reason for leave</label>
        <textarea
          id="alReason"
          placeholder="Briefly describe the reason…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="err">Reason cannot be empty.</div>
      </div>

      <div className="field">
        <label htmlFor="alContact">Emergency contact (optional)</label>
        <input
          id="alContact"
          type="tel"
          placeholder="Phone number while on leave"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>

      <div className="field-hint">
        {from && to && from <= to
          ? `${workDays} working day${workDays === 1 ? '' : 's'} selected (weekends and holidays excluded).`
          : 'Pick a date range to see the working-day count.'}
      </div>

      <div className={`field${invalid.approvalAuthority ? ' invalid' : ''}`}>
        <label htmlFor="alApprovalAuthority">Approval authority</label>
        <select
          id="alApprovalAuthority"
          value={approvalAuthority}
          onChange={(e) => setApprovalAuthority(e.target.value as 'Manager' | 'HR' | 'Admin' | 'Super Admin')}
        >
          <option value="Manager">Manager</option>
          <option value="HR">HR</option>
          <option value="Admin">Admin</option>
          <option value="Super Admin">Super Admin</option>
        </select>
        <div className="err">Select approval authority.</div>
      </div>

      <div className="attach-note">Attachment (medical certificate, etc.) — upload is enabled once the backend is connected.</div>

      {errors.length ? (
        <div className="form-error show" role="alert" style={{ marginTop: 10 }}>
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
