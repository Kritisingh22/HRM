/* MANAGER route table — only this role's file is ever downloaded. */
export default {
  workspace: 'manager',
  groups: [
    { group: 'Workspace', items: [
      { name: 'Dashboard', slug: 'dashboard', icon: 'dashboard', page: 'ManagerDashboard' },
      { name: 'Attendance', slug: 'attendance', icon: 'userCheck', page: 'Attendance' },
      { name: 'Leave', slug: 'leave', icon: 'calendar', page: 'Leave' },
      { name: 'Payroll', slug: 'payroll', icon: 'banknote', page: 'Payroll' },
      { name: 'Performance', slug: 'performance', icon: 'trendingUp', page: 'Performance' },
      { name: 'Projects', slug: 'projects', icon: 'briefcase', page: 'Projects' },
      { name: 'Documents', slug: 'documents', icon: 'fileText', page: 'Documents' },
      { name: 'Reports', slug: 'reports', icon: 'barChart', page: 'Reports' },
      { name: 'Analytics', slug: 'analytics', icon: 'barChart', page: 'Analytics' },
    ] },
    { group: 'More', items: [
      { name: 'Settings', slug: 'settings', icon: 'settings', page: 'Settings' },
      { name: 'My Profile', slug: 'profile', icon: 'user', page: 'MyProfile' },
      { name: 'Notice Board', slug: 'notices', icon: 'announcements', page: 'NoticeBoard' },
      { name: 'Helpdesk', slug: 'helpdesk', icon: 'bell', page: 'Helpdesk' },
      { name: 'Leave Approvals', slug: 'leave-approvals', icon: 'clipboardCheck', page: 'LeaveApprovals' },
      { name: 'Org Chart', slug: 'org-chart', icon: 'users', page: 'OrgChart' },
      { name: 'Offboarding', slug: 'offboarding', icon: 'logout', page: 'Offboarding' },
    ] },
  ],
};
