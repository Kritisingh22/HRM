/* Settings — read-only view of the authenticated user's role and the exact
 * permissions the backend granted them (from /api/auth/me). This is a window onto
 * the server's permission model, not a control panel: role assignment and
 * SUPER_ADMIN protection are enforced entirely server-side. */
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui';

export default function SettingsPage() {
  const { user } = useAuth();
  const perms = user?.permissions || [];

  return (
    <div className="ws-page">
      <div className="ws-page-head"><h1>Settings</h1><span className="ws-scope">Roles &amp; permissions</span></div>
      <div className="ws-grid2">
        <Card title="Your role" sub="Assigned by the system — cannot be self-changed">
          <div className="pf-row"><span className="pf-label">Role</span><span className="pf-value">{user?.role}</span></div>
          <div className="pf-row"><span className="pf-label">Workspace</span><span className="pf-value">{(user?.portal || '').toUpperCase() || '—'}</span></div>
          <div className="pf-row"><span className="pf-label">Employee ID</span><span className="pf-value">{user?.employeeId || '—'}</span></div>
        </Card>
        <Card title="Effective permissions" sub={perms.length + ' granted'}>
          {perms.length === 0 ? <p className="ws-muted">No explicit permissions.</p> : (
            <div className="ws-chips">{perms.map((p) => <span className="ws-chip" key={p}>{p}</span>)}</div>
          )}
        </Card>
      </div>
      <Card title="How access works here" className="pf-narrow">
        <p className="ws-muted" style={{ lineHeight: 1.6 }}>
          Every page and every action is authorised by the backend: authentication → role →
          permission → object-level ownership. Hiding a menu item is only cosmetic — the API
          independently refuses anything you are not allowed to do, so changing a URL or a
          request cannot bypass these rules.
        </p>
      </Card>
    </div>
  );
}
