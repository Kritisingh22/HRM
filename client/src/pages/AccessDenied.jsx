/* 403 Access Denied — shown when an authenticated user reaches a workspace their
 * role may not enter. Friendly message (no technical detail), plus a link back to
 * their OWN workspace. The backend independently refuses the data regardless of
 * what the browser shows, so this is a UX courtesy on top of real enforcement. */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const WS_NAME = { hr: 'HR', manager: 'Manager', employee: 'Employee' };

export default function AccessDenied({ workspace }) {
  const { user } = useAuth();
  const home = '/' + (user?.portal || 'employee');
  const wsLabel = WS_NAME[workspace] ? WS_NAME[workspace] + ' Workspace' : 'that workspace';

  return (
    <div className="denied-wrap">
      <div className="denied-card">
        <div className="denied-badge">403</div>
        <h1>Access Denied</h1>
        <p>You do not have permission to access the {wsLabel}.</p>
        <Link className="ws-btn primary" to={home}>Go to my workspace</Link>
      </div>
    </div>
  );
}
