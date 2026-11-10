/* Frontend permission helpers — single source of truth for UI gating.
 * Mirrors server permissions (server/utils/permissions.js) but only for UI
 * display decisions. All enforcement happens on the server.
 */
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export function can(role: Role | undefined, action: string): boolean {
  if (!role) return false;

  const PERMISSIONS: Record<Role, string[]> = {
    SUPER_ADMIN: ['*'],
    ADMIN: ['employees:*', 'leaves:*', 'attendance:*', 'payroll:*', 'hiring:*',
      'performance:*', 'projects:*', 'documents:*', 'notices:*', 'helpdesk:*',
      'offboarding:*', 'reports:read', 'analytics:read', 'audit:read',
      'dailyReports:*', 'notifications:*', 'requirements:*', 'transfers:*',
      'payslipRequests:*', 'tasks:read', 'tasks:write', 'tasks:approve'],
    HR: ['employees:read', 'employees:write', 'employees:delete',
      'leaves:read', 'leaves:write', 'leaves:approve',
      'attendance:read', 'attendance:write',
      'payroll:read', 'payroll:write',
      'hiring:read', 'hiring:write', 'hiring:delete',
      'performance:read', 'performance:write',
      'projects:read', 'projects:write',
      'documents:read', 'documents:write', 'documents:delete', 'documents:verify',
      'notices:read', 'notices:write', 'notices:delete',
      'helpdesk:read', 'helpdesk:write', 'helpdesk:manage',
      'offboarding:read', 'offboarding:write',
      'users:read',
      'reports:read', 'analytics:read', 'audit:read',
      'dailyReports:read', 'dailyReports:write', 'dailyReports:approve',
      'notifications:read',
      'requirements:*', 'transfers:*',
      'payslipRequests:read', 'payslipRequests:create', 'payslipRequests:review',
      'tasks:read', 'tasks:write'],
    MANAGER: [
      'employees:read', 'employees:update',
      'leaves:read', 'leaves:approve',
      'attendance:read',
      'performance:read', 'performance:write',
      'projects:read', 'projects:write',
      'documents:read',
      'notices:read', 'notices:write',
      'helpdesk:read', 'helpdesk:write', 'helpdesk:manage',
      'reports:read', 'analytics:read',
      'dailyReports:read', 'dailyReports:write', 'dailyReports:approve',
      'notifications:read',
      'requirements:read', 'requirements:write', 'requirements:read_own', 'requirements:write_own',
      'payslipRequests:read', 'payslipRequests:create', 'payslipRequests:review',
      'tasks:read', 'tasks:write', 'tasks:approve',
      'leaves:read_own', 'leaves:write_own', 'attendance:read_own', 'payroll:read_own',
      'employees:read_own', 'performance:read_own', 'projects:read_own', 'documents:read_own',
      'documents:write_own', 'helpdesk:write_own', 'dailyReports:read_own', 'dailyReports:write_own',
      'notifications:read_own', 'payslipRequests:read_own', 'payslipRequests:create_own',
      'transfers:approve', 'transfers:reject'],
    EMPLOYEE: [
      'employees:read_own',
      'leaves:read_own', 'leaves:write_own',
      'attendance:read_own',
      'payroll:read_own',
      'performance:read_own',
      'projects:read_own',
      'documents:read_own', 'documents:write_own',
      'notices:read',
      'helpdesk:read_own', 'helpdesk:write_own',
      'dailyReports:read_own', 'dailyReports:write_own',
      'notifications:read_own',
      'payslipRequests:read_own', 'payslipRequests:create_own',
      'tasks:read_own', 'tasks:write_own'],
  };

  const perms = PERMISSIONS[role] || [];
  if (perms.includes('*')) return true;
  if (perms.includes(action)) return true;
  const resource = action.split(':')[0];
  return perms.includes(`${resource}:*`);
}

/** Check if a user can approve/reject transfer tickets */
export function canManageTransfer(role: Role | undefined): boolean {
  return can(role, 'transfers:approve') || can(role, 'transfers:reject');
}

/** Check if a user can approve task status changes */
export function canApproveTask(role: Role | undefined): boolean {
  return can(role, 'tasks:approve');
}

/** Check if a user can view team tasks (manager/HR/Admin) */
export function canViewTeamTasks(role: Role | undefined): boolean {
  return role === 'MANAGER' || role === 'HR' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}
