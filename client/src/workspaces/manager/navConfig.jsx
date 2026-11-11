/* Manager Workspace Navigation Configuration.
 * Single source of truth for Manager workspace: roles, navigation items, and their permissions.
 * Each nav item defines the label, path, icon, page component, and required permissions.
 * The SAME config drives BOTH the sidebar links and the router. */
import { COLUMNS } from '../../components/columns';
import ResourcePage from '../../pages/common/ResourcePage';
import LeavePage from '../../pages/common/LeavePage';
import LeaveCalendarPage from '../../pages/common/LeaveCalendarPage';
import OrgChartPage from '../../pages/common/OrgChartPage';
import ProfilePage from '../../pages/common/ProfilePage';
import DocumentsPage from '../../pages/common/DocumentsPage';
import DailyReportPage from '../../pages/common/DailyReportPage';
import NotificationsPage from '../../pages/common/NotificationsPage';
import AggregateDashboard from '../../pages/dashboards/AggregateDashboard';

// Import Manager-specific pages
import { ManagerDashboard, MyTeamPage, TeamLeaveApprovalsPage, TeamPayslipRequestsPage, ManagerPayrollPage, ManagerTrainingPage, ManagerCertificationsPage, ManagerDocumentsPage } from './pages';

const BLUE = '#3b82f6';

// Map nav items to required permissions (module:action format)
// These are checked on the frontend for UI filtering; backend enforces authorization
export const MANAGER_NAV_PERMISSIONS = {
  'Dashboard': [],
  'My Team': ['employees:read'],
  'Team Attendance': ['attendance:read'],
  'Team Leave': ['leaves:read'],
  'Team Leave Calendar': ['leaves:read'],
  'Team Leave Approvals': ['leaves:read', 'leaves:approve'],
  'Team Payslip Requests': ['payslipRequests:read', 'payslipRequests:review'],
  'Team Performance': ['performance:read'],
  'Team Daily Reports': ['dailyReports:read'],
  'Team Projects': ['projects:read'],
  'Team Reports': ['reports:read'],
  'Team Payroll': ['payroll:read', 'payroll:write'],
  'Team Training': ['trainings:read'],
  'Team Certifications': ['certifications:read'],
  'Team Documents': ['documents:read'],
  'Documents': ['documents:read'],
  'Notices': ['notices:read'],
  'Notifications': ['notifications:read'],
  'Helpdesk': ['helpdesk:read'],
  'Org Chart': [],
  'Requirements': ['requirements:read', 'requirements:write'],
  'My Profile': [],
};

// convenience builders
const list = (title, endpoint, columns, scopeNote, extra = {}) =>
  <ResourcePage title={title} endpoint={endpoint} columns={columns} scopeNote={scopeNote} {...extra} />;

export const MANAGER_NAV_CONFIG = {
  key: 'manager',
  base: '/manager',
  title: 'Manager Workspace',
  short: 'Manager Portal',
  accent: BLUE,
  roles: ['MANAGER'],
  nav: [
    { label: 'Dashboard', path: '', icon: '▦', element: <ManagerDashboard />, permission: MANAGER_NAV_PERMISSIONS['Dashboard'] },
    { label: 'My Team', path: 'team', icon: '👥', element: <MyTeamPage />, permission: MANAGER_NAV_PERMISSIONS['My Team'] },
    { label: 'Team Attendance', path: 'attendance', icon: '🕒', element: list('Team Attendance', '/api/attendance', COLUMNS.attendance, 'Your team only'), permission: MANAGER_NAV_PERMISSIONS['Team Attendance'] },
    { label: 'Team Leave', path: 'leave', icon: '📅', element: <LeavePage title="Team Leave" scopeNote="Your team only" />, permission: MANAGER_NAV_PERMISSIONS['Team Leave'] },
    { label: 'Team Leave Calendar', path: 'leave-calendar', icon: '🗓️', element: <LeaveCalendarPage title="Team Leave Calendar" scopeNote="Your team's leave by date" />, permission: MANAGER_NAV_PERMISSIONS['Team Leave Calendar'] },
    { label: 'Team Leave Approvals', path: 'leave-approvals', icon: '✅', element: <TeamLeaveApprovalsPage />, permission: MANAGER_NAV_PERMISSIONS['Team Leave Approvals'] },
    { label: 'Team Payslip Requests', path: 'payslip-requests', icon: '📨', element: <TeamPayslipRequestsPage />, permission: MANAGER_NAV_PERMISSIONS['Team Payslip Requests'] },
    { label: 'Team Performance', path: 'performance', icon: '📈', element: list('Team Performance', '/api/performance', COLUMNS.performance, 'Your team only'), permission: MANAGER_NAV_PERMISSIONS['Team Performance'] },
    { label: 'Team Daily Reports', path: 'daily-reports', icon: '📋', element: <DailyReportPage title="Team Daily Reports" scopeNote="Your team's reports" />, permission: MANAGER_NAV_PERMISSIONS['Team Daily Reports'] },
    { label: 'Team Projects', path: 'projects', icon: '🗂️', element: list('Team Projects', '/api/projects', COLUMNS.projects, 'Your team only'), permission: MANAGER_NAV_PERMISSIONS['Team Projects'] },
    { label: 'Team Reports', path: 'reports', icon: '📊', element: <AggregateDashboard title="Team Reports" scopeNote="Your team only" accent={BLUE} />, permission: MANAGER_NAV_PERMISSIONS['Team Reports'] },
    { label: 'Team Payroll', path: 'payroll', icon: '💰', element: <ManagerPayrollPage />, permission: MANAGER_NAV_PERMISSIONS['Team Payroll'] },
    { label: 'Team Training', path: 'training', icon: '🎓', element: <ManagerTrainingPage />, permission: MANAGER_NAV_PERMISSIONS['Team Training'] },
    { label: 'Team Certifications', path: 'certifications', icon: '🏆', element: <ManagerCertificationsPage />, permission: MANAGER_NAV_PERMISSIONS['Team Certifications'] },
    { label: 'Team Documents', path: 'team-documents', icon: '📁', element: <ManagerDocumentsPage />, permission: MANAGER_NAV_PERMISSIONS['Team Documents'] },
    { label: 'Documents', path: 'documents', icon: '📄', element: <DocumentsPage />, permission: MANAGER_NAV_PERMISSIONS['Documents'] },
    { label: 'Notices', path: 'notices', icon: '📢', element: list('Notice Board', '/api/notices', COLUMNS.notices, 'Company announcements'), permission: MANAGER_NAV_PERMISSIONS['Notices'] },
    { label: 'Notifications', path: 'notifications', icon: '🔔', element: <NotificationsPage />, permission: MANAGER_NAV_PERMISSIONS['Notifications'] },
    { label: 'Helpdesk', path: 'helpdesk', icon: '🎫', element: list('Helpdesk', '/api/helpdesk', COLUMNS.helpdesk, 'Tickets'), permission: MANAGER_NAV_PERMISSIONS['Helpdesk'] },
    { label: 'Org Chart', path: 'org-chart', icon: '🌳', element: <OrgChartPage />, permission: MANAGER_NAV_PERMISSIONS['Org Chart'] },
    { label: 'Requirements', path: 'requirements', icon: '📋', element: <RequirementPage />, permission: MANAGER_NAV_PERMISSIONS['Requirements'] },
    { label: 'My Profile', path: 'profile', icon: '👤', element: <ProfilePage />, permission: MANAGER_NAV_PERMISSIONS['My Profile'] }
  ]
};