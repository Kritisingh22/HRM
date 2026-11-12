/* Employee Workspace Routes.
 * Defines all routes under /employee/* with the Employee workspace layout and role protection.
 * Each route maps a path to a page component from the nav config. */
import { createRoutesFromElements, Route, Navigate } from 'react-router-dom';
import { EMPLOYEE_NAV_CONFIG } from './navConfig';
import EmployeeWorkspaceLayout from './layouts/EmployeeWorkspaceLayout';
import ProtectedRoute from '../../auth/ProtectedRoute';

// Build child routes from nav config
function buildEmployeeRoutes() {
  return EMPLOYEE_NAV_CONFIG.nav.map((item) => (
    <Route
      key={item.label}
      path={item.path || ''}
      element={item.element}
      index={item.path === ''}
    />
  ));
}

// Employee routes wrapped in ProtectedRoute with EmployeeWorkspaceLayout
export const employeeRoutes = createRoutesFromElements(
  <Route
    path={EMPLOYEE_NAV_CONFIG.base}
    element={
      <ProtectedRoute roles={EMPLOYEE_NAV_CONFIG.roles} workspace={EMPLOYEE_NAV_CONFIG.key}>
        <EmployeeWorkspaceLayout />
      </ProtectedRoute>
    }
  >
    {buildEmployeeRoutes()}
    <Route path="*" element={<Navigate to={EMPLOYEE_NAV_CONFIG.base} replace />} />
  </Route>
);

// Default export for compatibility
export default employeeRoutes;