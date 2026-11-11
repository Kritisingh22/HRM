/* HR Workspace Navigation Configuration.
 * Single source of truth for HR workspace: roles, navigation items, and their permissions.
 * Each nav item defines the label, path, icon, page component, and required permissions.
 * The SAME config drives BOTH the sidebar links and the router.
 */
import { COLUMNS } from '../../components/columns';
import ResourcePage from '../../pages/common/ResourcePage';
import LeavePage from '../../pages/common/LeavePage';
import LeaveCalendarPage from '../../pages/common/LeaveCalendarPage';
import PayslipDetailPage from '../../pages/common/PayslipDetailPage';
import OrgChartPage from '../../pages/common/OrgChartPage';
import ProfilePage from '../../pages/common/ProfilePage';
import DocumentsPage from '../../pages/common/DocumentsPage';
import DailyReportPage from '../../pages/common/DailyReportPage';
import NotificationsPage from '../../pages/common/NotificationsPage';
import AggregateDashboard from '../../pages/dashboards/AggregateDashboard';

// Import HR-specific pages
import { HRDashboard, EmployeesPage, DepartmentsPage, SettingsPage, PayrollPage, RecruitmentPage, UsersPage, TransferPage, HRPayslipRequestsPage, HRLeaveTypesPage, HRSalaryStructuresPage, HREmployeeDocumentsPage, HRTrainingPage, HRCertificationsPage, HRCalendarPolicyPage } from './pages';

const TEAL = '#509888';

// Map nav items to required permissions (module:action format)
// These are checked on the frontend for UI filtering; backend enforces authorization
export const HR_NAV_PERMISSIONS = {
  'Dashboard': [],
  'Employees': ['employees:read'],
  'Managers': ['users:read'],
  'Departments': ['employees:read'],
  'Attendance': ['attendance:read'],
  'Leave': ['leaves:read'],
  'Leave Calendar': ['leaves:read'],
  'Payroll': ['payroll:read'],
  'Recruitment': ['hiring:read'],
  'Performance': ['performance:read'],
  'Daily Reports': ['dailyReports:read'],
  'Documents': ['documents:read'],
  'Projects': ['projects:read'],
  'Helpdesk': ['helpdesk:read'],
  'Reports': ['reports:read'],
  'Analytics': ['analytics:read'],
  'Notices': ['notices:read'],
  'Notifications': ['notifications:read'],
  'Users': ['users:read'],
  'Org Chart': [],
  'Settings': ['users:manage'],
  'My Profile': [],
  'Transfers': ['transfers:read'],
  'Payslip Requests': ['payslipRequests:read', 'payslipRequests:review'],
  'Leave Types': ['leaveTypes:read'],
  'Salary Structures': ['salaryStructures:read'],
  'Employee Documents': ['documents:read'],
  'Training': ['trainings:read'],
  'Certifications': ['certifications:read'],
  'Calendar Policy': ['calendar:read'],
};

// convenience builders
const list = (title, endpoint, columns, scopeNote, extra = {}) =>
  <ResourcePage title={title} endpoint={endpoint} columns={columns} scopeNote={scopeNote} {...extra} />;

export const HR_NAV_CONFIG = {
  key: 'hr',
  base: '/hr',
  title: 'HR Workspace',
  short: 'HR Portal',
  accent: TEAL,
  roles: ['HR', 'ADMIN', 'SUPER_ADMIN'],
  nav: [
    { label: 'Dashboard', path: '', icon: '▦', element: <HRDashboard />, permission: HR_NAV_PERMISSIONS['Dashboard'] },
    { label: 'Employees', path: 'employees', icon: '👥', element: <EmployeesPage />, permission: HR_NAV_PERMISSIONS['Employees'] },
    { label: 'Managers', path: 'managers', icon: '🧑‍💼', element: list('Managers', '/api/users', COLUMNS.users, 'Users with the Manager role', { filter: (u) => u.role === 'MANAGER' }), permission: HR_NAV_PERMISSIONS['Managers'] },
    { label: 'Departments', path: 'departments', icon: '🏢', element: <DepartmentsPage />, permission: HR_NAV_PERMISSIONS['Departments'] },
    { label: 'Attendance', path: 'attendance', icon: '🕒', element: list('Attendance', '/api/attendance', COLUMNS.attendance, 'Company-wide'), permission: HR_NAV_PERMISSIONS['Attendance'] },
    { label: 'Leave', path: 'leave', icon: '📅', element: <LeavePage title="Leave Management" scopeNote="All requests" />, permission: HR_NAV_PERMISSIONS['Leave'] },
    { label: 'Leave Calendar', path: 'leave-calendar', icon: '🗓️', element: <LeaveCalendarPage title="Leave Calendar" scopeNote="All leave by date" />, permission: HR_NAV_PERMISSIONS['Leave Calendar'] },
    { label: 'Leave Types', path: 'leave-types', icon: '🏷️', element: <HRLeaveTypesPage />, permission: HR_NAV_PERMISSIONS['Leave Types'] },
    { label: 'Payroll', path: 'payroll', icon: '💰', element: <PayrollPage />, permission: HR_NAV_PERMISSIONS['Payroll'] },
    { label: 'Salary Structures', path: 'salary-structures', icon: '💵', element: <HRSalaryStructuresPage />, permission: HR_NAV_PERMISSIONS['Salary Structures'] },
    { label: 'Payslip Requests', path: 'payslip-requests', icon: '📨', element: <HRPayslipRequestsPage />, permission: HR_NAV_PERMISSIONS['Payslip Requests'] },
    { label: 'Recruitment', path: 'recruitment', icon: '📣', element: <RecruitmentPage />, permission: HR_NAV_PERMISSIONS['Recruitment'] },
    { label: 'Performance', path: 'performance', icon: '📈', element: list('Performance', '/api/performance', COLUMNS.performance, 'Company-wide'), permission: HR_NAV_PERMISSIONS['Performance'] },
    { label: 'Daily Reports', path: 'daily-reports', icon: '📋', element: <DailyReportPage title="Daily Reports" scopeNote="All reports" />, permission: HR_NAV_PERMISSIONS['Daily Reports'] },
    { label: 'Documents', path: 'documents', icon: '📄', element: <DocumentsPage />, permission: HR_NAV_PERMISSIONS['Documents'] },
    { label: 'Employee Documents', path: 'employee-documents', icon: '📁', element: <HREmployeeDocumentsPage />, permission: HR_NAV_PERMISSIONS['Employee Documents'] },
    { label: 'Training', path: 'training', icon: '🎓', element: <HRTrainingPage />, permission: HR_NAV_PERMISSIONS['Training'] },
    { label: 'Certifications', path: 'certifications', icon: '🏆', element: <HRCertificationsPage />, permission: HR_NAV_PERMISSIONS['Certifications'] },
    { label: 'Calendar Policy', path: 'calendar-policy', icon: '📅', element: <HRCalendarPolicyPage />, permission: HR_NAV_PERMISSIONS['Calendar Policy'] },
    { label: 'Projects', path: 'projects', icon: '🗂️', element: list('Projects', '/api/projects', COLUMNS.projects, 'Company-wide'), permission: HR_NAV_PERMISSIONS['Projects'] },
    { label: 'Helpdesk', path: 'helpdesk', icon: '🎫', element: list('Helpdesk', '/api/helpdesk', COLUMNS.helpdesk, 'All tickets'), permission: HR_NAV_PERMISSIONS['Helpdesk'] },
    { label: 'Reports', path: 'reports', icon: '📊', element: <AggregateDashboard title="Reports" scopeNote="Company-wide" accent={TEAL} />, permission: HR_NAV_PERMISSIONS['Reports'] },
    { label: 'Analytics', path: 'analytics', icon: '🔎', element: <AggregateDashboard title="Analytics" scopeNote="Company-wide" accent={TEAL} />, permission: HR_NAV_PERMISSIONS['Analytics'] },
    { label: 'Notices', path: 'notices', icon: '📢', element: list('Notice Board', '/api/notices', COLUMNS.notices, 'Company announcements'), permission: HR_NAV_PERMISSIONS['Notices'] },
    { label: 'Notifications', path: 'notifications', icon: '🔔', element: <NotificationsPage />, permission: HR_NAV_PERMISSIONS['Notifications'] },
    { label: 'Users', path: 'users', icon: '🔐', element: <UsersPage />, permission: HR_NAV_PERMISSIONS['Users'] },
    { label: 'Org Chart', path: 'org-chart', icon: '🌳', element: <OrgChartPage />, permission: HR_NAV_PERMISSIONS['Org Chart'] },
    { label: 'Transfers', path: 'transfers', icon: '🔄', element: <TransferPage />, permission: HR_NAV_PERMISSIONS['Transfers'] },
    { label: 'Settings', path: 'settings', icon: '⚙️', element: <SettingsPage />, permission: HR_NAV_PERMISSIONS['Settings'] },
    { label: 'My Profile', path: 'profile', icon: '👤', element: <ProfilePage />, permission: HR_NAV_PERMISSIONS['My Profile'] }
  ]
};