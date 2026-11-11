/* Manager Workspace Routes.
 * Defines all routes under /manager/* with the Manager workspace layout and role protection.
 * Each route maps a path to a page component from the nav config. */
import { createRoutesFromElements, Route, Navigate } from 'react-router-dom';
import { MANAGER_NAV_CONFIG } from './navConfig';
import ManagerWorkspaceLayout from './layouts/ManagerWorkspaceLayout';
import ProtectedRoute from '../../auth/ProtectedRoute';

// Build child routes from nav config
function buildManagerRoutes() {
  return MANAGER_NAV_CONFIG.nav.map((item) => (
    <Route
      key={item.label}
      path={item.path || ''}
      element={item.element}
      index={item.path === ''}
    />
  ));
}

// Manager routes wrapped in ProtectedRoute with ManagerWorkspaceLayout
export const managerRoutes = createRoutesFromElements(
  <Route
    path={MANAGER_NAV_CONFIG.base}
    element={
      <ProtectedRoute roles={MANAGER_NAV_CONFIG.roles} workspace={MANAGER_NAV_CONFIG.key}>
        <ManagerWorkspaceLayout />
      </ProtectedRoute>
    }
  >
    {buildManagerRoutes()}
    <Route path="*" element={<Navigate to={MANAGER_NAV_CONFIG.base} replace />} />
  </Route>
);

// Default export for compatibility
export default managerRoutes;