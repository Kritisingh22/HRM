/* ============================================================
   Login — the auth gate. Demo credentials are listed on the card
   so every role can be explored without a backend.
   ============================================================ */
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { DEMO_CREDENTIALS } from '@/api/mockServer';
import logoMark from '../../../img/cyethack-logo.svg';

export function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* Demo accounts are gated behind an env flag so they are hidden in
     production by default (no plaintext credentials exposed). Only enable
     by setting VITE_SHOW_DEMO_ACCOUNTS=true. */
  const showDemoAccounts = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

  /* Surface the message apiRequest stashed before sending us to login
     ("Please sign in to continue." / the demo-account hint). */
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('cyethackHRM.loginMessage');
      sessionStorage.removeItem('cyethackHRM.loginMessage');
      if (msg) setError(msg);
    } catch { /* storage unavailable — nothing to surface */ }
  }, []);

  if (status === 'authenticated' && user) return <Navigate to="/" replace />;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setBusy(true);
    try {
      await login(email, password, remember);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src={logoMark} alt="" />
          <span className="nm">CYETHACK</span>
          <span className="sl">HRM Portal — HR · Manager · Employee</span>
        </div>
        <div className="auth-title">Sign in to continue</div>
        {showDemoAccounts && (
          <div className="auth-sub">Use one of the demo accounts below to explore each role.</div>
        )}

        {error ? (
          <div className="auth-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="auth-field">
          <label htmlFor="loginEmail">Work email</label>
          <div className="auth-inwrap">
            <input
              id="loginEmail"
              type="email"
              autoComplete="username"
              value={email}
              className={error ? 'invalid' : ''}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@cyethack.com"
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="loginPassword">Password</label>
          <div className="auth-inwrap">
            <input
              id="loginPassword"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              className={error ? 'invalid' : ''}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button className="auth-toggle" type="button" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="auth-row">
          <label className="auth-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in
          </label>
          <span className="auth-hint">Session lasts 12 hours</span>
          <span className="auth-hint">
            With “Keep me signed in”, opening the portal in a new tab or window restores your
            session — the access token is never saved to disk (it is re-minted from the server’s
            refresh cookie). Without it, the session lasts this tab only.
          </span>
        </div>

        <button className="btn btn-primary auth-btn" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
          {!busy ? <Icon name="chevronRight" size={16} /> : null}
        </button>

        <div
          className="auth-hint"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}
        >
          <Icon name="mapPin" size={13} /> Sign-ins record your location only if the browser allows — never in the background
        </div>

        {showDemoAccounts && (
          <div className="auth-demo">
            <div className="h">Demo accounts — click to fill</div>
            {DEMO_CREDENTIALS.map((cred) => (
              <button
                key={cred.email}
                type="button"
                onClick={() => {
                  setEmail(cred.email);
                  setPassword(cred.password);
                  setError('');
                }}
              >
                <code>{cred.label}</code> · {cred.email} · {cred.password}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
