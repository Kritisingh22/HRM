/* Navbar profile section: avatar + name + role + a dropdown (Profile, Log out).
 * "Account Settings" is intentionally omitted — the portal has no such page, and
 * the brief says not to add unnecessary functionality. Logout goes through a
 * confirmation dialog and the existing AuthContext.logout (which calls the real
 * POST /api/auth/logout, revoking the refresh-token family + clearing the cookie). */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import ConfirmDialog from './ConfirmDialog';

const initials = (n) => (n || '').split(/\s+/).map((x) => x[0] || '').slice(0, 2).join('').toUpperCase();

export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const goProfile = () => { setOpen(false); window.location.href = '/' + (user?.portal || 'employee') + '/profile'; };

  const doLogout = async () => {
    if (busy) return;               // idempotent — ignore repeat clicks
    setBusy(true);
    try { await logout(); }         // revokes refresh token + clears cookie + in-memory token + user state
    catch { /* even if the API call fails, AuthContext.logout has cleared local state */ }
    finally { setConfirm(false); setBusy(false); setOpen(false); }
  };

  return (
    <div className="pm-wrap" ref={wrapRef}>
      <button
        className="pm-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pm-avatar">{initials(user?.name)}</span>
        <span className="pm-id">
          <span className="pm-name">{user?.name}</span>
          <span className="pm-role">{user?.role}</span>
        </span>
        <span className={'pm-caret' + (open ? ' up' : '')} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="pm-menu" role="menu">
          <div className="pm-head">
            <span className="pm-avatar lg">{initials(user?.name)}</span>
            <div><b>{user?.name}</b><span>{user?.role}</span></div>
          </div>
          <div className="pm-sep" />
          <button className="pm-item" role="menuitem" onClick={goProfile}>👤 Profile</button>
          <div className="pm-sep" />
          <button className="pm-item danger" role="menuitem" onClick={() => { setOpen(false); setConfirm(true); }}>🚪 Log out</button>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Are you sure you want to log out?"
        message="You will need to sign in again to access your HR Portal."
        cancelText="Cancel"
        confirmText={busy ? 'Logging out…' : 'Log out'}
        onCancel={() => setConfirm(false)}
        onConfirm={doLogout}
      />
    </div>
  );
}
