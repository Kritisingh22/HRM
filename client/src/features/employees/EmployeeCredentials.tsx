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
  resetEmployeeCredentials,
  inviteEmployee,
  setAccountStatus,
  type ResetPasswordResponse,
  type ResetCredentialsResponse,
  type InviteResponse,
  type SetAccountStatusResponse,
} from '@/api/employees';
import { ApiError } from '@/api/services/http';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { niceDate } from '@/lib/date';
import { statusClass } from '@/lib/format';
import { downloadEmployeeCredentialsTxt } from '@/lib/credentials';

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
    username: string;
    tempPassword: string;
    welcomeText: string;
    activationToken: string;
    creatorName: string;
    creatorRole: string;
  };
}

/** One-time credential display shown immediately after employee creation. */
export function CredentialModal({ open, onClose, data }: CredentialModalProps) {
  if (!open || !data) return null;

  const { toast } = useToast();

  const downloadWelcomeText = () => {
    const blob = new Blob([data.welcomeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welcome-${data.employeeId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      title="Employee created — one-time credentials"
      onClose={onClose}
      large
      footer={
        <>
          <button
            className="btn btn-outline"
            onClick={() => navigator.clipboard.writeText(data.welcomeText).then(() => toast('Welcome text copied'))}
            type="button"
          >
            Copy welcome text
          </button>
          <button className="btn btn-outline" onClick={downloadWelcomeText} type="button">
            Download .txt
          </button>
          <button className="btn btn-primary" onClick={onClose} type="button">
            I have saved the credentials
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Welcome text — the main copyable block */}
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
            Welcome message (copy and deliver to the employee)
          </div>
          <textarea
            readOnly
            value={data.welcomeText}
            style={{
              width: '100%',
              minHeight: 160,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 10,
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 8 }}>
            <p style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text-1)' }}>
              ⚠ The temporary password is shown <b>once only</b>. If this modal is closed,
              it cannot be retrieved — use the password-reset workflow instead.
            </p>
            <p style={{ margin: 0 }}>
              Deliver this welcome text to <b>{data.employeeName}</b> out-of-band. The account
              must be activated at first login (the employee <b>must change their password</b>).
            </p>
          </div>
        </div>

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
              Username
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <code style={{ fontSize: 15, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {data.username}
              </code>
              <CopyButton value={data.username} label="Copy username" size={14} />
            </div>

            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Temporary password (shown once)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <code style={{ fontSize: 15, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {data.tempPassword}
              </code>
              <CopyButton value={data.tempPassword} label="Copy temporary password" size={14} />
            </div>

            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Activation token (invitation alternative)
            </div>
            <div style={{ marginBottom: 14 }}>
              <code style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }}>
                {data.activationToken}
              </code>
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
      </div>
    </Modal>
  );
}

interface ResetPasswordDialogProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Admin-initiated password reset confirmation. */
export function ResetPasswordDialog({
  open,
  employeeId,
  employeeName,
  employeeEmail,
  onClose,
  onSuccess,
}: ResetPasswordDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetPasswordResponse | null>(null);
  const [tempPasswordVisible, setTempPasswordVisible] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await resetEmployeePassword(employeeId);
      if (!res || !res.success || !res.credentials) {
        throw new Error('Invalid reset response from server.');
      }
      setResult(res);

      // Auto-download the TXT credentials file after successful reset.
      try {
        downloadEmployeeCredentialsTxt({
          employeeName: res.credentials.employeeName,
          employeeId: undefined, // backend reset-password response does not include employeeId at top level
          username: res.credentials.username,
          email: res.credentials.email,
          temporaryPassword: res.credentials.temporaryPassword,
          mustChangePassword: res.credentials.mustChangePassword,
          expiresAt: res.credentials.expiresAt,
        });
      } catch {
        /* best-effort download; modal still offers manual download */
      }

      toast(`Temporary password generated for ${employeeName}. Credentials downloaded.`, 'success');
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.status) {
          case 401:
            toast('Unauthorized — please log in again.', 'error');
            break;
          case 403:
            toast('Forbidden — you do not have permission to reset this password.', 'error');
            break;
          case 404:
            toast('Employee not found.', 'error');
            break;
          case 429:
            const retryAfter = err.details?.retryAfter || 60;
            const minutes = Math.ceil(retryAfter / 60);
            toast(`Too many reset requests. Please try again in ${minutes} minute(s).`, 'error');
            break;
          case 500:
            toast('Internal server error. Please try again later.', 'error');
            break;
          default:
            toast(err.message || 'Password reset failed.', 'error');
        }
      } else if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
          toast('Network error — the reset may still have been processed. Do not retry blindly.', 'error');
        } else {
          toast(err.message || 'Password reset failed.', 'error');
        }
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [employeeId, employeeName, toast, onSuccess]);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(result.credentials.email).then(() => toast('Email copied')).catch(() => {/* silent fail */});
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(result.credentials.username).then(() => toast('Username copied')).catch(() => {/* silent fail */});
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(result.credentials.temporaryPassword).then(() => toast('Password copied')).catch(() => {/* silent fail */});
  };

  const handleCopyAll = () => {
    const creds = [
      `Employee Name: ${result.credentials.employeeName}`,
      `Username: ${result.credentials.username}`,
      `Email: ${result.credentials.email}`,
      `Temporary Password: ${result.credentials.temporaryPassword}`,
    ].join('\n');
    navigator.clipboard.writeText(creds).then(() => toast('All credentials copied')).catch(() => {/* silent fail */});
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    try {
      downloadEmployeeCredentialsTxt({
        employeeName: result.credentials.employeeName,
        username: result.credentials.username,
        email: result.credentials.email,
        temporaryPassword: result.credentials.temporaryPassword,
        mustChangePassword: result.credentials.mustChangePassword,
        expiresAt: result.credentials.expiresAt,
      });
      toast('Credentials file downloaded.', 'success');
    } catch {
      toast('Could not generate credentials file.', 'error');
    }
  };

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
              Employee Name
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <code style={{ fontSize: 14, fontWeight: 500, background: 'var(--surface)', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', flex: 1, minWidth: 200 }}>
                {result.credentials.employeeName}
              </code>
            </div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Username
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <code style={{ fontSize: 14, fontWeight: 500, background: 'var(--surface)', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', flex: 1, minWidth: 200 }}>
                {result.credentials.username}
              </code>
              <button onClick={handleCopyUsername} style={{ padding: '0 8px', background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }} title="Copy username">
                Copy
              </button>
            </div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Temporary Password (shown once)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <code
                style={{
                  fontSize: 14, fontWeight: 600, background: 'var(--surface)', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)',
                  ...(tempPasswordVisible ? {} : 'user-select: none'),
                }}
                onClick={tempPasswordVisible ? undefined : () => setTempPasswordVisible(true)}
                title={tempPasswordVisible ? 'Hide password' : 'Show password'}
              >
                {tempPasswordVisible ? result.credentials.temporaryPassword : '••••••••••••••••'}
              </code>
              <button onClick={handleCopyPassword} style={{ padding: '0 8px', background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }} title="Copy password">
                Copy
              </button>
            </div>
            {result.credentials.expiresAt && (
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>
                Expires: {new Date(result.credentials.expiresAt).toLocaleString()}
              </div>
            )}
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <DetailList rows={[
              ['Employee ID', employeeId],
              ['Login User ID', '—'],
              ['Employee', result.credentials.employeeName],
              ['Must change password', result.credentials.mustChangePassword ? 'Yes' : 'No'],
              ['Initiated by', user?.name ?? '—'],
              ['Message', result.message],
            ]} />
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16, marginTop: 12 }}>
            <DetailList rows={[
              ['Username', result.credentials.username],
              ['Email', result.credentials.email],
              ['Must change password', result.credentials.mustChangePassword ? 'Yes' : 'No'],
            ]} />
          </div>

          <div style={{ marginTop: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 8 }}>
              Actions
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                onClick={handleDownloadTxt}
                type="button"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                📄 Download Credentials (.txt)
              </button>
              <button
                className="btn btn-outline"
                onClick={handleCopyPassword}
                type="button"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                🔐 Copy Password
              </button>
              <button
                className="btn btn-outline"
                onClick={handleCopyUsername}
                type="button"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                👤 Copy Username
              </button>
              <button
                className="btn btn-outline"
                onClick={handleCopyAll}
                type="button"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                📋 Copy All Credentials
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <p style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text-1)' }}>
                Share these credentials securely with the employee.
              </p>
              <p style={{ margin: 0 }}>
                The employee must change this temporary password after their first login.
                The password is shown only once — if this dialog closes, it cannot be
                retrieved. Perform another reset to generate a new temporary password.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, padding: 10 }}>
          Share these credentials securely with the employee. The temporary password must be changed immediately after the first login.
        </div>
      )}
    </Modal>
  );
}

interface ResetCredentialsDialogProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/** HR-initiated credentials reset: generates a new temp password and shows a
 *  new welcome text (password shown once only). */
export function ResetCredentialsDialog({
  open,
  employeeId,
  employeeName,
  onClose,
  onSuccess,
}: ResetCredentialsDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetCredentialsResponse | null>(null);

  const downloadWelcomeText = () => {
    const blob = new Blob([result!.welcomeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welcome-${employeeId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await resetEmployeeCredentials(employeeId);
      setResult(res);
      toast(`Credentials reset for ${employeeName}. Temporary password shown once.`, 'success');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Credentials reset failed.';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [employeeId, employeeName, toast, onSuccess]);

  return (
    <Modal
      title={`Reset credentials — ${employeeName}`}
      onClose={onClose}
      large
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          {result ? (
            <>
              <button className="btn btn-outline" onClick={() => navigator.clipboard.writeText(result.welcomeText)} type="button">
                Copy welcome text
              </button>
              <button className="btn btn-outline" onClick={downloadWelcomeText} type="button">
                Download .txt
              </button>
            </>
          ) : (
            <button
              className="btn btn-danger-outline"
              disabled={busy || !!result}
              onClick={run}
              type="button"
            >
              {busy ? 'Resetting…' : 'Generate new credentials'}
            </button>
          )}
        </>
      }
    >
      {result ? (
        <div className="form-2col" style={{ gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Welcome message (copy and deliver to the employee)
            </div>
            <textarea
              readOnly
              value={result.welcomeText}
              style={{
                width: '100%',
                minHeight: 160,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                lineHeight: 1.6,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 10,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 8 }}>
              <p style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text-1)' }}>
                ⚠ The temporary password is shown <b>once only</b>. If this dialog is closed,
                it cannot be retrieved — use the reset workflow again.
              </p>
              <p style={{ margin: 0 }}>
                Deliver this welcome text to <b>{employeeName}</b> out-of-band. The employee
                <b>must change their password</b> at next login.
              </p>
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <DetailList rows={[
              ['Employee ID', result.employeeId],
              ['Login User ID', result.loginUserId],
              ['Username', result.username],
              ['Employee', result.employeeName],
              ['Must change password', result.mustChangePassword ? 'Yes' : 'No'],
              ['Initiated by', user?.name ?? '—'],
              ['Message', result.message],
            ]} />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, padding: 10 }}>
          Resetting the credentials for <b>{employeeName}</b> will:<br />
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
