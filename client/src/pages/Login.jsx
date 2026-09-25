/* Login page — reproduces the Cyethack look (dark navy + teal). Talks to the
 * real backend through AuthContext. */
import { useState } from 'react';
<<<<<<< HEAD
import { useNavigate, Navigate } from 'react-router-dom';
=======
>>>>>>> 0f31467 (intial Update HRM 1.1)
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, isAuthenticated, loading, user } = useAuth();
<<<<<<< HEAD
  const navigate = useNavigate();
=======
>>>>>>> 0f31467 (intial Update HRM 1.1)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Scenario 8: an already-authenticated user should never see the login form —
  // send them straight to their own workspace (the backend role decides which).
  if (loading) return <div className="center">Loading…</div>;
<<<<<<< HEAD
  if (isAuthenticated) return <Navigate to={'/' + (user.portal || 'employee')} replace />;
=======
  if (isAuthenticated) return null; // RoleRedirect handles redirect
>>>>>>> 0f31467 (intial Update HRM 1.1)

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email) return setError('Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Password is required.');
    setBusy(true);
<<<<<<< HEAD
    try { await login(email, password); navigate('/'); }
=======
    try { await login(email, password); }
>>>>>>> 0f31467 (intial Update HRM 1.1)
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
<<<<<<< HEAD
        <div className="demo">Dev accounts: hr@cyethack.com / Hr@123 · employee@cyethack.com / Employee@123</div>
=======
        <div className="demo">Dev accounts: jaya.sahu@cyethack.com / JayaCY0125JS201 · surya.dwivedi@cyethack.com / SuryCY0824SD301 · rohith.sai@cyethack.com / GangCY0525RS109</div>
>>>>>>> 0f31467 (intial Update HRM 1.1)
      </form>
    </div>
  );
}
