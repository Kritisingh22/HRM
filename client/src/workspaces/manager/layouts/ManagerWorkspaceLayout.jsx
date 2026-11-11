/* Manager Workspace Layout — thin wrapper around the shared workspace shell.
 * Passes Manager-specific config (navigation, accent color, roles) to WorkspaceLayout. */
import WorkspaceLayout from '../../../workspace/WorkspaceLayout';
import { MANAGER_NAV_CONFIG } from '../navConfig';

export default function ManagerWorkspaceLayout() {
  return <WorkspaceLayout config={MANAGER_NAV_CONFIG} />;
}