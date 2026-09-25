/* Routing. One login → the server's role decides the workspace. /hr, /manager and
 * /employee are separate, role-guarded route trees, each with its own layout and
 * nested pages built from navConfig. "/" redirects each user to their own
 * workspace; entering another workspace's URL shows a 403 Access-Denied page. The
 * backend independently authorises every API call, so these guards are UX, not the
 * security boundary. */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import Login from './pages/Login';
import HRLayout from './workspace/HRLayout';
import ManagerLayout from './workspace/ManagerLayout';
import EmployeeLayout from './workspace/EmployeeLayout';
import { WORKSPACES } from './workspace/navConfig';

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={'/' + (user.portal || 'employee')} replace />;
}

const LAYOUTS = { hr: HRLayout, manager: ManagerLayout, employee: EmployeeLayout };

function childRoutes(ws) {
  return ws.nav.map((item) => (
    <Route key={item.label} index={item.path === ''} path={item.path || undefined} element={item.element} />
  ));
}

<<<<<<< HEAD
=======
// Inner routes component that gets remounted when sessionKey changes
function AppRoutes({ sessionKey }) {
  return (
    <Routes key={sessionKey}>
      <Route path="/login" element={<Login />} />
      {Object.values(WORKSPACES).map((ws) => {
        const Layout = LAYOUTS[ws.key];
        return (
          <Route
            key={ws.key}
            path={ws.base}
            element={<ProtectedRoute roles={ws.roles} workspace={ws.key}><Layout /></ProtectedRoute>}
          >
            {childRoutes(ws)}
            <Route path="*" element={<Navigate to={ws.base} replace />} />
          </Route>
        );
      })}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

>>>>>>> 0f31467 (intial Update HRM 1.1)
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
<<<<<<< HEAD
        <Routes>
          <Route path="/login" element={<Login />} />
          {Object.values(WORKSPACES).map((ws) => {
            const Layout = LAYOUTS[ws.key];
            return (
              <Route
                key={ws.key}
                path={ws.base}
                element={<ProtectedRoute roles={ws.roles} workspace={ws.key}><Layout /></ProtectedRoute>}
              >
                {childRoutes(ws)}
                <Route path="*" element={<Navigate to={ws.base} replace />} />
              </Route>
            );
          })}
          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
=======
        <AppRoutesContainer />
>>>>>>> 0f31467 (intial Update HRM 1.1)
      </BrowserRouter>
    </AuthProvider>
  );
}
<<<<<<< HEAD
=======

function AppRoutesContainer() {
  const { sessionKey } = useAuth();
  return <AppRoutes sessionKey={sessionKey} />;
}
>>>>>>> 0f31467 (intial Update HRM 1.1)
