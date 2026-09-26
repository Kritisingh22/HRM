/* Single source of truth for the three workspaces. Each entry defines the role
 * set that may enter, the sidebar nav, and the page rendered at each path. The
 * SAME config drives BOTH the sidebar links and the router (see App.jsx), so a
 * menu item and its page can never drift apart. Every page reads a shared,
 * backend-scoped API endpoint — the role decides scope on the server. */
import { COLUMNS } from '../components/columns';
import ResourcePage from '../pages/common/ResourcePage';
import LeavePage from '../pages/common/LeavePage';
import LeaveCalendarPage from '../pages/common/LeaveCalendarPage';
import PayslipDetailPage from '../pages/common/PayslipDetailPage';
import OrgChartPage from '../pages/common/OrgChartPage';
import ProfilePage from '../pages/common/ProfilePage';
import DocumentsPage from '../pages/common/DocumentsPage';
import DailyReportPage from '../pages/common/DailyReportPage';
import NotificationsPage from '../pages/common/NotificationsPage';
import AggregateDashboard from '../pages/dashboards/AggregateDashboard';
import EmployeeDashboard from '../pages/dashboards/EmployeeDashboard';
import UsersPage from '../pages/hr/UsersPage';
import DepartmentsPage from '../pages/hr/DepartmentsPage';
import SettingsPage from '../pages/hr/SettingsPage';
import EmployeesPage from '../pages/hr/EmployeesPage';
import PayrollPage from '../pages/hr/PayrollPage';
import RecruitmentPage from '../pages/hr/RecruitmentPage';
import MyManagerPage from '../pages/employee/MyManagerPage';
import EmployeePayrollPage from '../pages/employee/EmployeePayrollPage';
import RequirementPage from '../pages/manager/RequirementPage';
import TransferPage from '../pages/hr/TransferPage';

const TEAL = '#509888';

// Map nav items to required permissions (module:action format)
// These are checked on the frontend for UI filtering; backend enforces authorization
const NAV_PERMISSIONS = {
  // HR workspace
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
  
  // Manager workspace
  'My Team': ['employees:read'],
  'Team Attendance': ['attendance:read'],
  'Team Leave': ['leaves:read'],
  'Team Leave Calendar': ['leaves:read'],
  'Team Performance': ['performance:read'],
  'Team Daily Reports': ['dailyReports:read'],
  'Team Projects': ['projects:read'],
  'Team Reports': ['reports:read'],
  'Requirements': ['requirements:read', 'requirements:write'],
  
  // Employee workspace
  'My Attendance': ['attendance:read_own'],
  'My Leave': ['leaves:read_own'],
  'My Leave Calendar': ['leaves:read_own'],
  'My Payroll': ['payroll:read_own'],
  'My Payslip': ['payroll:read_own'],
  'My Daily Reports': ['dailyReports:read_own'],
  'My Documents': ['documents:read_own'],
  'My Projects': ['projects:read_own'],
  'My Performance': ['performance:read_own'],
  'My Manager': [],
};

// convenience builders
const list = (title, endpoint, columns, scopeNote, extra = {}) =>
  <ResourcePage title={title} endpoint={endpoint} columns={columns} scopeNote={scopeNote} {...extra} />;

export const WORKSPACES = {
  hr: {
    key: 'hr', base: '/hr', title: 'HR Workspace', short: 'HR Portal', accent: TEAL,
    roles: ['HR', 'ADMIN', 'SUPER_ADMIN'],
    nav: [
      { label: 'Dashboard', path: '', icon: '▦', element: <AggregateDashboard title="HR Dashboard" scopeNote="Company-wide" accent={TEAL} />, permission: NAV_PERMISSIONS['Dashboard'] },
      { label: 'Employees', path: 'employees', icon: '👥', element: <EmployeesPage />, permission: NAV_PERMISSIONS['Employees'] },
      { label: 'Managers', path: 'managers', icon: '🧑‍💼', element: list('Managers', '/api/users', COLUMNS.users, 'Users with the Manager role', { filter: (u) => u.role === 'MANAGER' }), permission: NAV_PERMISSIONS['Managers'] },
      { label: 'Departments', path: 'departments', icon: '🏢', element: <DepartmentsPage />, permission: NAV_PERMISSIONS['Departments'] },
      { label: 'Attendance', path: 'attendance', icon: '🕒', element: list('Attendance', '/api/attendance', COLUMNS.attendance, 'Company-wide'), permission: NAV_PERMISSIONS['Attendance'] },
      { label: 'Leave', path: 'leave', icon: '📅', element: <LeavePage title="Leave Management" scopeNote="All requests" />, permission: NAV_PERMISSIONS['Leave'] },
      { label: 'Leave Calendar', path: 'leave-calendar', icon: '🗓️', element: <LeaveCalendarPage title="Leave Calendar" scopeNote="All leave by date" />, permission: NAV_PERMISSIONS['Leave Calendar'] },
      { label: 'Payroll', path: 'payroll', icon: '💰', element: <PayrollPage />, permission: NAV_PERMISSIONS['Payroll'] },
      { label: 'Recruitment', path: 'recruitment', icon: '📣', element: <RecruitmentPage />, permission: NAV_PERMISSIONS['Recruitment'] },
      { label: 'Performance', path: 'performance', icon: '📈', element: list('Performance', '/api/performance', COLUMNS.performance, 'Company-wide'), permission: NAV_PERMISSIONS['Performance'] },
      { label: 'Daily Reports', path: 'daily-reports', icon: '📋', element: <DailyReportPage title="Daily Reports" scopeNote="All reports" />, permission: NAV_PERMISSIONS['Daily Reports'] },
      { label: 'Documents', path: 'documents', icon: '📄', element: list('Documents', '/api/documents', COLUMNS.documents, 'Company-wide'), permission: NAV_PERMISSIONS['Documents'] },
      { label: 'Projects', path: 'projects', icon: '🗂️', element: list('Projects', '/api/projects', COLUMNS.projects, 'Company-wide'), permission: NAV_PERMISSIONS['Projects'] },
      { label: 'Helpdesk', path: 'helpdesk', icon: '🎫', element: list('Helpdesk', '/api/helpdesk', COLUMNS.helpdesk, 'All tickets'), permission: NAV_PERMISSIONS['Helpdesk'] },
      { label: 'Reports', path: 'reports', icon: '📊', element: <AggregateDashboard title="Reports" scopeNote="Company-wide" accent={TEAL} />, permission: NAV_PERMISSIONS['Reports'] },
      { label: 'Analytics', path: 'analytics', icon: '🔎', element: <AggregateDashboard title="Analytics" scopeNote="Company-wide" accent={TEAL} />, permission: NAV_PERMISSIONS['Analytics'] },
      { label: 'Notices', path: 'notices', icon: '📢', element: list('Notice Board', '/api/notices', COLUMNS.notices, 'Company announcements'), permission: NAV_PERMISSIONS['Notices'] },
      { label: 'Notifications', path: 'notifications', icon: '🔔', element: <NotificationsPage />, permission: NAV_PERMISSIONS['Notifications'] },
      { label: 'Users', path: 'users', icon: '🔐', element: <UsersPage />, permission: NAV_PERMISSIONS['Users'] },
      { label: 'Org Chart', path: 'org-chart', icon: '🌳', element: <OrgChartPage />, permission: NAV_PERMISSIONS['Org Chart'] },
      { label: 'Transfers', path: 'transfers', icon: '🔄', element: <TransferPage />, permission: NAV_PERMISSIONS['Transfers'] },
      { label: 'Settings', path: 'settings', icon: '⚙️', element: <SettingsPage />, permission: NAV_PERMISSIONS['Settings'] },
      { label: 'My Profile', path: 'profile', icon: '👤', element: <ProfilePage />, permission: NAV_PERMISSIONS['My Profile'] }
    ]
  },

  manager: {
    key: 'manager', base: '/manager', title: 'Manager Workspace', short: 'Manager Portal', accent: '#3b82f6',
    roles: ['MANAGER'],
    nav: [
      { label: 'Dashboard', path: '', icon: '▦', element: <AggregateDashboard title="Manager Dashboard" scopeNote="Your team only" accent="#3b82f6" />, permission: NAV_PERMISSIONS['Dashboard'] },
      { label: 'My Team', path: 'team', icon: '👥', element: list('My Team', '/api/employees', COLUMNS.team, 'Your direct & indirect reports'), permission: NAV_PERMISSIONS['My Team'] },
      { label: 'Team Attendance', path: 'attendance', icon: '🕒', element: list('Team Attendance', '/api/attendance', COLUMNS.attendance, 'Your team only'), permission: NAV_PERMISSIONS['Team Attendance'] },
      { label: 'Team Leave', path: 'leave', icon: '📅', element: <LeavePage title="Team Leave" scopeNote="Your team only" />, permission: NAV_PERMISSIONS['Team Leave'] },
      { label: 'Team Leave Calendar', path: 'leave-calendar', icon: '🗓️', element: <LeaveCalendarPage title="Team Leave Calendar" scopeNote="Your team's leave by date" />, permission: NAV_PERMISSIONS['Team Leave Calendar'] },
      { label: 'Team Performance', path: 'performance', icon: '📈', element: list('Team Performance', '/api/performance', COLUMNS.performance, 'Your team only'), permission: NAV_PERMISSIONS['Team Performance'] },
      { label: 'Team Daily Reports', path: 'daily-reports', icon: '📋', element: <DailyReportPage title="Team Daily Reports" scopeNote="Your team's reports" />, permission: NAV_PERMISSIONS['Team Daily Reports'] },
      { label: 'Team Projects', path: 'projects', icon: '🗂️', element: list('Team Projects', '/api/projects', COLUMNS.projects, 'Your team only'), permission: NAV_PERMISSIONS['Team Projects'] },
      { label: 'Team Reports', path: 'reports', icon: '📊', element: <AggregateDashboard title="Team Reports" scopeNote="Your team only" accent="#3b82f6" />, permission: NAV_PERMISSIONS['Team Reports'] },
      { label: 'Documents', path: 'documents', icon: '📄', element: list('Documents', '/api/documents', COLUMNS.documents, 'Your team only'), permission: NAV_PERMISSIONS['Documents'] },
      { label: 'Notices', path: 'notices', icon: '📢', element: list('Notice Board', '/api/notices', COLUMNS.notices, 'Company announcements'), permission: NAV_PERMISSIONS['Notices'] },
      { label: 'Notifications', path: 'notifications', icon: '🔔', element: <NotificationsPage />, permission: NAV_PERMISSIONS['Notifications'] },
      { label: 'Helpdesk', path: 'helpdesk', icon: '🎫', element: list('Helpdesk', '/api/helpdesk', COLUMNS.helpdesk, 'Tickets'), permission: NAV_PERMISSIONS['Helpdesk'] },
      { label: 'Org Chart', path: 'org-chart', icon: '🌳', element: <OrgChartPage />, permission: NAV_PERMISSIONS['Org Chart'] },
      { label: 'Requirements', path: 'requirements', icon: '📋', element: <RequirementPage />, permission: NAV_PERMISSIONS['Requirements'] },
      { label: 'My Profile', path: 'profile', icon: '👤', element: <ProfilePage />, permission: NAV_PERMISSIONS['My Profile'] }
    ]
  },

  employee: {
    key: 'employee', base: '/employee', title: 'Employee Workspace', short: 'Employee Portal', accent: '#8b5cf6',
    roles: ['EMPLOYEE'],
    nav: [
      { label: 'Dashboard', path: '', icon: '▦', element: <EmployeeDashboard />, permission: NAV_PERMISSIONS['Dashboard'] },
      { label: 'My Profile', path: 'profile', icon: '👤', element: <ProfilePage />, permission: NAV_PERMISSIONS['My Profile'] },
      { label: 'My Attendance', path: 'attendance', icon: '🕒', element: list('My Attendance', '/api/attendance', COLUMNS.attendance, 'Your records'), permission: NAV_PERMISSIONS['My Attendance'] },
      { label: 'My Leave', path: 'leave', icon: '📅', element: <LeavePage title="My Leave" scopeNote="Your requests" />, permission: NAV_PERMISSIONS['My Leave'] },
      { label: 'My Leave Calendar', path: 'leave-calendar', icon: '🗓️', element: <LeaveCalendarPage title="My Leave Calendar" scopeNote="Your leave by date" />, permission: NAV_PERMISSIONS['My Leave Calendar'] },
      { label: 'My Payroll', path: 'payroll', icon: '💰', element: <EmployeePayrollPage />, permission: NAV_PERMISSIONS['My Payroll'] },
      { label: 'My Payslip', path: 'payroll/:id', icon: '📄', element: <PayslipDetailPage />, permission: NAV_PERMISSIONS['My Payslip'] },
      { label: 'My Daily Reports', path: 'daily-reports', icon: '📋', element: <DailyReportPage title="My Daily Reports" scopeNote="Your reports" />, permission: NAV_PERMISSIONS['My Daily Reports'] },
      { label: 'My Documents', path: 'documents', icon: '📄', element: <DocumentsPage />, permission: NAV_PERMISSIONS['My Documents'] },
      { label: 'Notifications', path: 'notifications', icon: '🔔', element: <NotificationsPage />, permission: NAV_PERMISSIONS['Notifications'] },
      { label: 'My Projects', path: 'projects', icon: '🗂️', element: list('My Projects', '/api/projects', COLUMNS.projects, 'Your projects'), permission: NAV_PERMISSIONS['My Projects'] },
      { label: 'My Performance', path: 'performance', icon: '📈', element: list('My Performance', '/api/performance', COLUMNS.performance, 'Your reviews'), permission: NAV_PERMISSIONS['My Performance'] },
      { label: 'My Manager', path: 'manager', icon: '🧑‍💼', element: <MyManagerPage />, permission: NAV_PERMISSIONS['My Manager'] },
      { label: 'Notices', path: 'notices', icon: '📢', element: list('Notice Board', '/api/notices', COLUMNS.notices, 'Company announcements'), permission: NAV_PERMISSIONS['Notices'] },
      { label: 'Helpdesk', path: 'helpdesk', icon: '🎫', element: list('My Tickets', '/api/helpdesk', COLUMNS.helpdesk, 'Your tickets'), permission: NAV_PERMISSIONS['Helpdesk'] },
      { label: 'Org Chart', path: 'org-chart', icon: '🌳', element: <OrgChartPage />, permission: NAV_PERMISSIONS['Org Chart'] }
    ]
  }
};
