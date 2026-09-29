/* Login page — reproduces the Cyethack look (dark navy + teal). Talks to the
 * real backend through AuthContext. */
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Scenario 8: an already-authenticated user should never see the login form —
  // send them straight to their own workspace (the backend role decides which).
  if (loading) return <div className="center">Loading…</div>;
  if (isAuthenticated) return <Navigate to={'/' + (user.portal || 'employee')} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email) return setError('Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Password is required.');
    setBusy(true);
    try { await login(email, password); navigate('/'); }
    catch (err) { setError(err.status === 401 ? 'Invalid email or password.' : (err.message || 'Login failed.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <div className="brand"><div className="logo">C</div><div className="nm">CYETHACK</div><div className="sl">Your privacy, our priority</div></div>
        <h1>Sign in</h1>
        {error && <div className="err">{error}</div>}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cyethack.com" autoComplete="username" />
        <label>Password</label>
        <div className="pw">
          <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
          <button type="button" className="toggle" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
