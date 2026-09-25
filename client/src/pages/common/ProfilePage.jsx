/* Profile page — the CURRENTLY AUTHENTICATED user only. Identity comes from
 * AuthContext (GET /api/auth/me). The editable fields save through
 * PUT /api/employees/me/profile, which the backend resolves from the token and
 * limits to phone/location/address/emergency — role, department, manager, salary,
 * status and ID are read-only. Change Password uses POST /api/auth/change-password
 * (which revokes other sessions), after which the user is signed out to re-login. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/api';
import { Card, initials } from '../../components/ui';

function Row({ label, value }) {
  return <div className="pf-row"><span className="pf-label">{label}</span><span className="pf-value">{value || <em className="pf-empty">—</em>}</span></div>;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(null);
  const [form, setForm] = useState({ phone: '', location: '', address: '', emergencyContact: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!user?.employeeId) return;
      try {
        const { employee } = await api.get('/api/employees/' + user.employeeId);
        if (!live) return;
        setEmp(employee);
        setForm({ phone: employee.phone || '', location: employee.location || '', address: employee.address || '', emergencyContact: employee.emergencyContact || '' });
      } catch { /* platform account with no employee record */ }
    })();
    return () => { live = false; };
  }, [user]);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      const { employee } = await api.put('/api/employees/me/profile', form);
      setEmp(employee);
      setSaveMsg('Saved.');
    } catch (err) { setSaveMsg(err.status === 404 ? 'No employee record linked to your account.' : 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>My Profile</h1><span className="ws-scope">Your account, as signed in</span></div>

      <div className="pf-head">
        <span className="pf-avatar">{initials(user?.name)}</span>
        <div><h2>{user?.name}</h2><p className="ws-muted">{user?.role}{user?.designation ? ' · ' + user.designation : ''}{user?.employeeId ? ' · ' + user.employeeId : ''}</p></div>
      </div>

      <div className="ws-grid2">
        <Card title="Account" sub="Maintained by HR — read-only">
          <Row label="Full Name" value={user?.name} />
          <Row label="Email" value={user?.email} />
          <Row label="Employee ID" value={user?.employeeId} />
          <Row label="Role" value={user?.role} />
          <Row label="Department" value={emp?.department || user?.department} />
          <Row label="Designation" value={emp?.designation || user?.designation} />
          <Row label="Reporting Manager" value={emp?.manager} />
          <Row label="Status" value={emp?.status || user?.status} />
        </Card>

        <Card title="Contact details" sub="You can update these">
          {user?.employeeId ? (
            <form onSubmit={saveProfile} className="pf-form">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" />
              <label>Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City / office" />
              <label>Address</label>
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Your current address" />
              <label>Emergency contact</label>
              <input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Name & number" />
              <div className="pf-actions">
                <button className="ws-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save my details'}</button>
                {saveMsg && <span className="pf-msg">{saveMsg}</span>}
              </div>
            </form>
          ) : <p className="ws-muted">No employee record is linked to this account.</p>}
        </Card>
      </div>

      <ChangePassword onDone={async () => { await logout(); navigate('/login', { replace: true }); }} />
    </div>
  );
}

function ChangePassword({ onDone }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (f.newPassword.length < 8) return setMsg({ err: true, text: 'New password must be at least 8 characters.' });
    if (f.newPassword !== f.confirm) return setMsg({ err: true, text: 'New passwords do not match.' });
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      setMsg({ err: false, text: 'Password changed. Signing you out — please sign in again.' });
      setTimeout(onDone, 1400);
    } catch (err) {
      setMsg({ err: true, text: err.status === 401 ? 'Current password is incorrect.' : 'Could not change password.' });
    } finally { setBusy(false); }
  }

  return (
    <Card title="Change password" sub="You will be signed out after changing it" className="pf-narrow">
      <form onSubmit={submit} className="pf-form">
        <label>Current password</label>
        <input type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} autoComplete="current-password" />
        <label>New password</label>
        <input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" />
        <label>Confirm new password</label>
        <input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" />
        <div className="pf-actions">
          <button className="ws-btn" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
          {msg && <span className={'pf-msg' + (msg.err ? ' err' : '')}>{msg.text}</span>}
        </div>
      </form>
    </Card>
  );
}
