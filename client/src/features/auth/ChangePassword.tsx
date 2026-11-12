/* ============================================================
   Change Password — first-login / forced password change.

   Shown when the account has `mustChangePassword = true` (new hire
   activation or admin-initiated reset). The user must provide their
   current (temporary) password and a new password. Until this is done,
   normal HRM functionality is blocked by the route guard.
   ============================================================ */
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { changePassword as changePasswordApi } from '@/api/auth';
import logoMark from '../../../img/cyethack-logo.svg';

interface ChangePasswordPageProps {
  /** When set, the page auto-navigates here after a successful change. */
  redirectTo?: string;
}

export function ChangePasswordPage({ redirectTo }: ChangePasswordPageProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError('');
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePasswordApi({ currentPassword, newPassword });
      // First-login change clears mustChangePassword and revokes old sessions.
      // Sign in again with the new password to obtain a fresh session.
      await logout();
      navigate(redirectTo ?? '/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password change failed. Please try again.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src={logoMark} alt="" />
          <span className="nm">CYETHACK</span>
          <span className="sl">HRM Portal — Set your password</span>
        </div>
        <div className="auth-title">Set a new password</div>
        <div className="auth-sub">
          Your account requires a password change before you can access the portal.
        </div>

        {error ? (
          <div className="auth-error" role="alert">{error}</div>
        ) : null}

        <div className="auth-field">
          <label htmlFor="cpwCurrent">Current password</label>
          <div className="auth-inwrap">
            <input
              id="cpwCurrent"
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              className={error ? 'invalid' : ''}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button className="auth-toggle" type="button" onClick={() => setShowCurrent((v) => !v)}>
              {showCurrent ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="cpwNew">New password</label>
          <div className="auth-inwrap">
            <input
              id="cpwNew"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              className={error ? 'invalid' : ''}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button className="auth-toggle" type="button" onClick={() => setShowNew((v) => !v)}>
              {showNew ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="cpwConfirm">Confirm new password</label>
          <div className="auth-inwrap">
            <input
              id="cpwConfirm"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              className={error ? 'invalid' : ''}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button className="auth-toggle" type="button" onClick={() => setShowConfirm((v) => !v)}>
              {showConfirm ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button className="btn btn-primary auth-btn" type="submit" disabled={busy}>
          {busy ? 'Changing password…' : 'Change password'}
          {!busy ? <Icon name="chevronRight" size={16} /> : null}
        </button>
      </form>
    </div>
  );
}
