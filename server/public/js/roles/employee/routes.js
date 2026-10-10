/* EMPLOYEE route table — only this role's file is ever downloaded. */
export default {
  workspace: 'employee',
  groups: [
    { group: 'Workspace', items: [
      { name: 'Dashboard', slug: 'dashboard', icon: 'dashboard', page: 'EmployeeDashboard' },
      { name: 'Attendance', slug: 'attendance', icon: 'userCheck', page: 'Attendance' },
      { name: 'Leave', slug: 'leave', icon: 'calendar', page: 'Leave' },
      { name: 'Payroll', slug: 'payroll', icon: 'banknote', page: 'Payroll' },
      { name: 'Performance', slug: 'performance', icon: 'trendingUp', page: 'Performance' },
      { name: 'Projects', slug: 'projects', icon: 'briefcase', page: 'Projects' },
      { name: 'Documents', slug: 'documents', icon: 'fileText', page: 'Documents' },
      { name: 'To-Do', slug: 'todo', icon: 'clipboardCheck', page: 'Todo' },
      { name: 'Reports', slug: 'reports', icon: 'barChart', page: 'Reports' },
    ] },
    { group: 'More', items: [
      { name: 'Settings', slug: 'settings', icon: 'settings', page: 'Settings' },
      { name: 'My Profile', slug: 'profile', icon: 'user', page: 'MyProfile' },
      { name: 'Notice Board', slug: 'notices', icon: 'announcements', page: 'NoticeBoard' },
      { name: 'Helpdesk', slug: 'helpdesk', icon: 'bell', page: 'Helpdesk' },
    ] },
  ],
};
