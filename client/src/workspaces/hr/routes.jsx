/* HR Workspace Routes.
 * Defines all routes under /hr/* with the HR workspace layout and role protection.
 * Each route maps a path to a page component from the nav config.
 */
import { createRoutesFromElements, Route, Navigate } from 'react-router-dom';
import { HR_NAV_CONFIG } from './navConfig';
import HRWorkspaceLayout from './layouts/HRWorkspaceLayout';
import ProtectedRoute from '../../auth/ProtectedRoute';

// Build child routes from nav config
function buildHRRoutes() {
  return HR_NAV_CONFIG.nav.map((item) => (
    <Route
      key={item.label}
      path={item.path || ''}
      element={item.element}
      index={item.path === ''}
    />
  ));
}

// HR routes wrapped in ProtectedRoute with HRWorkspaceLayout
export const hrRoutes = createRoutesFromElements(
  <Route
    path={HR_NAV_CONFIG.base}
    element={
      <ProtectedRoute roles={HR_NAV_CONFIG.roles} workspace={HR_NAV_CONFIG.key}>
        <HRWorkspaceLayout />
      </ProtectedRoute>
    }
  >
    {buildHRRoutes()}
    <Route path="*" element={<Navigate to={HR_NAV_CONFIG.base} replace />} />
  </Route>
);

// Default export for compatibility
export default hrRoutes;