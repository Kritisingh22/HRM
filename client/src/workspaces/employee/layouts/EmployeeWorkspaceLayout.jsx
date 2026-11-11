/* Employee Workspace Layout — thin wrapper around the shared workspace shell.
 * Passes Employee-specific config (navigation, accent color, roles) to WorkspaceLayout. */
import WorkspaceLayout from '../../../workspace/WorkspaceLayout';
import { EMPLOYEE_NAV_CONFIG } from '../navConfig';

export default function EmployeeWorkspaceLayout() {
  return <WorkspaceLayout config={EMPLOYEE_NAV_CONFIG} />;
}