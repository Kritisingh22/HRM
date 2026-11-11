/* ============================================================
   Employee credential management UI.

   Modals/dialogs for the one-time credential flows:
   · Creation success modal (temporary password + copy buttons)
   · Reset password dialog (admin-initiated)
   · Invite dialog (one-time setup token)
   · Account status toggle (activate/deactivate)
   · Employee activity history (audit)

   These are deliberately separate from ResourceView's generic create/edit
   so the one-time credential display can be shown exactly once and never
   re-shown after the modal closes.
   ============================================================ */
import { useCallback, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  CopyButton,
  DetailList,
  Pill,
  type DetailRow,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import {
  resetEmployeePassword,
  inviteEmployee,
  setAccountStatus,
  type ResetPasswordResponse,
  type InviteResponse,
  type SetAccountStatusResponse,
} from '@/api/employees';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { niceDate } from '@/lib/date';
import { statusClass } from '@/lib/format';

interface CredentialModalProps {
  open: boolean;
  onClose: () => void;
  /** One-time credentials to display (never re-rendered after close). */
  data?: {
    employeeId: string;
    loginUserId: string;
    employeeName: string;
    department: string;
    designation: string;
    role: string;
    accountStatus: string;
    temporaryPassword: string;
    activationToken: string;
    creatorName: string;
    creatorRole: string;
  };
}

/** One-time credential display shown immediately after employee creation. */
export function CredentialModal({ open, onClose, data }: CredentialModalProps) {
  if (!open || !data) return null;

  return (
    <Modal
      title="Employee created — one-time credentials"
      onClose={onClose}
      large
      footer={
        <button className="btn btn-primary" onClick={onClose} type="button">
          I have saved the credentials
        </button>
      }
    >
      <div className="form-2col" style={{ gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
            Employee ID
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <code style={{ fontSize: 15, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {data.employeeId}
            </code>
            <CopyButton value={data.employeeId} label="Copy Employee ID" size={14} />
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
            Login User ID
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <code style={{ fontSize: 15, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {data.loginUserId}
            </code>
            <CopyButton value={data.loginUserId} label="Copy Login User ID" size={14} />
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
            Temporary password (shown once)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <code style={{ fontSize: 15, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {data.temporaryPassword}
            </code>
            <CopyButton value={data.temporaryPassword} label="Copy temporary password" size={14} />
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
            Activation token (invitation alternative)
          </div>
          <div style={{ marginBottom: 14 }}>
            <code style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }}>
              {data.activationToken}
            </code>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <p style={{ marginBottom: 6 }}>
              Deliver the temporary password to {data.employeeName} out-of-band. It is shown <b>once only</b> — if this
              modal is closed, use the password-reset workflow instead of retrieving the original password.
            </p>
            <p style={{ margin: 0 }}>
              Account must be activated at first login (<b>must change password</b>).
            </p>
          </div>
        </div>

        <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Employee</span>
            <span style={{ fontWeight: 600 }}>{data.employeeName}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</span>
            <span>{data.department}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Designation</span>
            <span>{data.designation}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned role</span>
            <span>{data.role}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account status</span>
            <Pill status={data.accountStatus} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created by</span>
            <span>{data.creatorName} · {data.creatorRole}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface ResetPasswordDialogProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Admin-initiated password reset confirmation. */
export function ResetPasswordDialog({
  open,
  employeeId,
  employeeName,
  onClose,
  onSuccess,
}: ResetPasswordDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetPasswordResponse | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await resetEmployeePassword(employeeId);
      setResult(res);
      toast(`Temporary password generated for ${employeeName}. Shown once only.`, 'success');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password reset failed.';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [employeeId, employeeName, toast, onSuccess]);

  return (
    <Modal
      title={`Reset password — ${employeeName}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-danger-outline"
            disabled={busy || !!result}
            onClick={run}
            type="button"
          >
            {busy ? 'Resetting…' : 'Generate temporary password'}
          </button>
        </>
      }
    >
      {result ? (
        <div className="form-2col" style={{ gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Temporary password (shown once)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <code style={{ fontSize: 15, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {result.temporaryPassword}
              </code>
              <CopyButton value={result.temporaryPassword} label="Copy temporary password" size={14} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 8 }}>
              Deliver this to {employeeName} out-of-band. It cannot be retrieved again —
              if this dialog is closed, use the reset workflow again. The employee must
              change it at next login.
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <DetailList rows={[
              ['Employee ID', result.employeeId],
              ['Login User ID', result.loginUserId],
              ['Employee', result.employeeName],
              ['Must change password', result.mustChangePassword ? 'Yes' : 'No'],
              ['Initiated by', user?.name ?? '—'],
              ['Message', result.message],
            ]} />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, padding: 10 }}>
          Resetting the password for <b>{employeeName}</b> will:<br />
          · Generate a new temporary password (shown once)<br />
          · Force a password change at next login<br />
          · Revoke all existing refresh sessions<br />
          · Notify the employee and record the reset in the audit log<br /><br />
          The existing password is never revealed. Confirm to proceed.
        </div>
      )}
    </Modal>
  );
}

interface InviteDialogProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/** One-time password-setup invitation. */
export function InviteDialog({
  open,
  employeeId,
  employeeName,
  onClose,
  onSuccess,
}: InviteDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResponse | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await inviteEmployee(employeeId);
      setResult(res);
      toast(`Setup invitation generated for ${employeeName}.`, 'success');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invitation generation failed.';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [employeeId, employeeName, toast, onSuccess]);

  return (
    <Modal
      title={`Send setup invitation — ${employeeName}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !!result}
            onClick={run}
            type="button"
          >
            {busy ? 'Generating…' : 'Generate setup token'}
          </button>
        </>
      }
    >
      {result ? (
        <div className="form-2col" style={{ gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              One-time setup token (shown once)
            </div>
            <div style={{ marginBottom: 10 }}>
              <code style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }}>
                {result.setupToken}
              </code>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 8 }}>
              Deliver this token to {employeeName} out-of-band. They redeem it at
              account activation to set their password. The token expires in 7 days
              and is single-use — it cannot be retrieved again after this dialog closes.
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-2)' }}>
              Expires {new Date(result.setupTokenExpires).toLocaleString()}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <DetailList rows={[
              ['Employee ID', result.employeeId],
              ['Login User ID', result.loginUserId],
              ['Employee', result.employeeName],
              ['Must change password', result.mustChangePassword ? 'Yes' : 'No'],
            ]} />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, padding: 10 }}>
          Generating a one-time password-setup invitation for <b>{employeeName}</b> will:<br />
          · Create a random setup token (hashed at rest, single-use, 7-day expiry)<br />
          · Let the employee set their password at activation<br />
          · Record the invitation in the audit log<br /><br />
          The token is never stored plaintext and shown only once.
        </div>
      )}
    </Modal>
  );
}

interface AccountStatusDialogProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  currentStatus: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Activate / deactivate an account. */
export function AccountStatusDialog({
  open,
  employeeId,
  employeeName,
  currentStatus,
  onClose,
  onSuccess,
}: AccountStatusDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SetAccountStatusResponse | null>(null);
  const target = currentStatus === 'active' ? 'inactive' : 'active';

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await setAccountStatus(employeeId, target as any);
      setResult(res);
      toast(`Account ${res.accountStatus}.`, 'success');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Status change failed.';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [employeeId, target, toast, onSuccess]);

  const isDeactivating = target !== 'active';

  return (
    <Modal
      title={`Account status — ${employeeName}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={`btn btn-sm ${isDeactivating ? 'btn-danger-outline' : 'btn-primary'}`}
            disabled={busy || !!result}
            onClick={run}
            type="button"
          >
            {busy ? (isDeactivating ? 'Deactivating…' : 'Activating…') : isDeactivating ? 'Deactivate account' : 'Activate account'}
          </button>
        </>
      }
    >
      {result ? (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, padding: 10 }}>
          <p style={{ marginBottom: 8, fontWeight: 600 }}>
            Account {result.accountStatus === 'active' ? 'activated' : 'deactivated'}.
          </p>
          <DetailList rows={[
            ['Employee ID', result.employeeId],
            ['Login User ID', result.loginUserId],
            ['Account status', result.accountStatus],
            ['Employee status', result.employeeStatus],
            ['Message', result.message],
          ]} />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, padding: 10 }}>
          The login account for <b>{employeeName}</b> is currently{' '}
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{currentStatus}</span>.
          <br /><br />
          {isDeactivating
            ? 'Deactivating will revoke all refresh sessions and prevent sign-in. Reactivate later to restore access.'
            : 'Activating restores sign-in access for this account.'}
        </div>
      )}
    </Modal>
  );
}

interface ActivityHistoryProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}

/** Employee activity history read from the audit log. */
export function ActivityHistory({ open, employeeId, employeeName, onClose }: ActivityHistoryProps) {
  const [logs, setLogs] = useState<Array<{ action: string; actorName: string; actorRole: string; description: string; createdAt: Date }>>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/audit?targetId=${encodeURIComponent(employeeId)}&limit=50`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cyethackHRM.user') ? '' : ''}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.logs) {
        setLogs(data.logs.map((l: any) => ({
          action: l.action,
          actorName: l.actorName || '—',
          actorRole: l.actorRole || '—',
          description: l.description,
          createdAt: new Date(l.createdAt),
        })));
      }
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
    }
  }, [employeeId]);

  return (
    <Modal
      title={`Activity history — ${employeeName}`}
      onClose={onClose}
      large
    >
      {busy ? (
        <div style={{ padding: 20, color: 'var(--text-2)' }}>Loading activity…</div>
      ) : (
        <div style={{ paddingTop: 8 }}>
          {logs.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-2)', textAlign: 'center' }}>
              <Icon name="alertTriangle" size={20} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              No activity recorded for {employeeName}.
            </div>
          ) : (
            <table className="data" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>When</th>
                  <th style={{ textAlign: 'left' }}>Action</th>
                  <th style={{ textAlign: 'left' }}>Actor</th>
                  <th style={{ textAlign: 'left' }}>Role</th>
                  <th style={{ textAlign: 'left' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={`${l.action}-${l.createdAt.getTime()}`}>
                    <td>{niceDate(l.createdAt.toISOString())}</td>
                    <td style={{ fontWeight: 500, textTransform: 'lowercase' }}>{l.action.replace(/_/g, ' ')}</td>
                    <td>{l.actorName}</td>
                    <td>{l.actorRole}</td>
                    <td style={{ color: 'var(--text-2)', fontSize: 11 }}>{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose} type="button">Close</button>
        {logs.length > 0 && (
          <button className="btn btn-outline" onClick={() => load()} type="button">Refresh</button>
        )}
      </div>
    </Modal>
  );
}
