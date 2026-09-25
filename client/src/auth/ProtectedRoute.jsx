/* Guards a route. Unauthenticated → /login. Wrong role for this workspace → an
 * explicit 403 Access-Denied page (not a silent redirect). Frontend gate only —
 * the backend still enforces every API call independently, so this is UX on top
 * of real enforcement, never the security boundary itself. */
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AccessDenied from '../pages/AccessDenied';

export default function ProtectedRoute({ children, roles, workspace }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <AccessDenied workspace={workspace} />;
  return children;
}
