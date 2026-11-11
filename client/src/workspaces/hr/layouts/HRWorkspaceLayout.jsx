/* HR Workspace Layout — thin wrapper around the shared workspace shell.
 * Passes HR-specific config (navigation, accent color, roles) to WorkspaceLayout. */
import WorkspaceLayout from '../../../workspace/WorkspaceLayout';
import { HR_NAV_CONFIG } from '../navConfig';

export default function HRWorkspaceLayout() {
  return <WorkspaceLayout config={HR_NAV_CONFIG} />;
}