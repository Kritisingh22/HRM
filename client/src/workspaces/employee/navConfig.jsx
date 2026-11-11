/* Employee Workspace Navigation Configuration.
 * Single source of truth for Employee workspace: roles, navigation items, and their permissions.
 * Each nav item defines the label, path, icon, page component, and required permissions.
 * The SAME config drives BOTH the sidebar links and the router. */
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

// Import Employee-specific pages
import { EmployeeDashboard, EmployeePayrollPage, MyManagerPage, EmployeePayslipRequestsPage, EmployeeTrainingPage, EmployeeCertificationsPage, EmployeeDocumentsPage } from './pages';

const PURPLE = '#8b5cf6';

// Map nav items to required permissions (module:action format)
// These are checked on the frontend for UI filtering; backend enforces authorization
export const EMPLOYEE_NAV_PERMISSIONS = {
  'Dashboard': [],
  'My Profile': [],
  'My Attendance': ['attendance:read_own'],
  'My Leave': ['leaves:read_own'],
  'My Leave Calendar': ['leaves:read_own'],
  'My Payroll': ['payroll:read_own'],
  'My Payslip': ['payroll:read_own'],
  'My Payslip Requests': ['payslipRequests:read_own', 'payslipRequests:create_own'],
  'My Daily Reports': ['dailyReports:read_own'],
  'My Documents': ['documents:read_own'],
  'My Training': ['trainings:read_own'],
  'My Certifications': ['certifications:read_own'],
  'Notifications': ['notifications:read'],
  'My Projects': ['projects:read_own'],
  'My Performance': ['performance:read_own'],
  'My Manager': [],
  'Notices': ['notices:read'],
  'Helpdesk': ['helpdesk:read_own'],
  'Org Chart': [],
};

// convenience builders
const list = (title, endpoint, columns, scopeNote, extra = {}) =>
  <ResourcePage title={title} endpoint={endpoint} columns={columns} scopeNote={scopeNote} {...extra} />;

export const EMPLOYEE_NAV_CONFIG = {
  key: 'employee',
  base: '/employee',
  title: 'Employee Workspace',
  short: 'Employee Portal',
  accent: PURPLE,
  roles: ['EMPLOYEE'],
  nav: [
    { label: 'Dashboard', path: '', icon: '▦', element: <EmployeeDashboard />, permission: EMPLOYEE_NAV_PERMISSIONS['Dashboard'] },
    { label: 'My Profile', path: 'profile', icon: '👤', element: <ProfilePage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Profile'] },
    { label: 'My Attendance', path: 'attendance', icon: '🕒', element: list('My Attendance', '/api/attendance', COLUMNS.attendance, 'Your records'), permission: EMPLOYEE_NAV_PERMISSIONS['My Attendance'] },
    { label: 'My Leave', path: 'leave', icon: '📅', element: <LeavePage title="My Leave" scopeNote="Your requests" />, permission: EMPLOYEE_NAV_PERMISSIONS['My Leave'] },
    { label: 'My Leave Calendar', path: 'leave-calendar', icon: '🗓️', element: <LeaveCalendarPage title="My Leave Calendar" scopeNote="Your leave by date" />, permission: EMPLOYEE_NAV_PERMISSIONS['My Leave Calendar'] },
    { label: 'My Payroll', path: 'payroll', icon: '💰', element: <EmployeePayrollPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Payroll'] },
    { label: 'My Payslip', path: 'payroll/:id', icon: '📄', element: <PayslipDetailPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Payslip'] },
    { label: 'My Payslip Requests', path: 'payslip-requests', icon: '📨', element: <EmployeePayslipRequestsPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Payslip Requests'] },
    { label: 'My Daily Reports', path: 'daily-reports', icon: '📋', element: <DailyReportPage title="My Daily Reports" scopeNote="Your reports" />, permission: EMPLOYEE_NAV_PERMISSIONS['My Daily Reports'] },
    { label: 'My Documents', path: 'documents', icon: '📄', element: <EmployeeDocumentsPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Documents'] },
    { label: 'My Training', path: 'training', icon: '🎓', element: <EmployeeTrainingPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Training'] },
    { label: 'My Certifications', path: 'certifications', icon: '🏆', element: <EmployeeCertificationsPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Certifications'] },
    { label: 'Notifications', path: 'notifications', icon: '🔔', element: <NotificationsPage />, permission: EMPLOYEE_NAV_PERMISSIONS['Notifications'] },
    { label: 'My Projects', path: 'projects', icon: '🗂️', element: list('My Projects', '/api/projects', COLUMNS.projects, 'Your projects'), permission: EMPLOYEE_NAV_PERMISSIONS['My Projects'] },
    { label: 'My Performance', path: 'performance', icon: '📈', element: list('My Performance', '/api/performance', COLUMNS.performance, 'Your reviews'), permission: EMPLOYEE_NAV_PERMISSIONS['My Performance'] },
    { label: 'My Manager', path: 'manager', icon: '🧑‍💼', element: <MyManagerPage />, permission: EMPLOYEE_NAV_PERMISSIONS['My Manager'] },
    { label: 'Notices', path: 'notices', icon: '📢', element: list('Notice Board', '/api/notices', COLUMNS.notices, 'Company announcements'), permission: EMPLOYEE_NAV_PERMISSIONS['Notices'] },
    { label: 'Helpdesk', path: 'helpdesk', icon: '🎫', element: list('My Tickets', '/api/helpdesk', COLUMNS.helpdesk, 'Your tickets'), permission: EMPLOYEE_NAV_PERMISSIONS['Helpdesk'] },
    { label: 'Org Chart', path: 'org-chart', icon: '🌳', element: <OrgChartPage />, permission: EMPLOYEE_NAV_PERMISSIONS['Org Chart'] }
  ]
};