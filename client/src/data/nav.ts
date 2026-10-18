/* ============================================================
   Navigation & access model — the single place that answers
   "which pages can this role see, and what are they called?"
   ============================================================ */
import type { Portal, Role } from '@/types';

export interface NavItem {
  page: string;
  icon: string;
  /** portal-specific display label, applied by `navForRole` */
  label?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The full sidebar, in the order the portal presents it. */
export const NAV: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { page: 'Dashboard', icon: 'dashboard' },
      { page: 'Employees', icon: 'users' },
      { page: 'Attendance', icon: 'userCheck' },
      { page: 'Leave', icon: 'calendar' },
      { page: 'Payroll', icon: 'banknote' },
      { page: 'Recruitment', icon: 'briefcase' },
      { page: 'Performance', icon: 'trendingUp' },
      { page: 'Projects', icon: 'folderKanban' },
    ],
  },
  {
    label: 'Transfers',
    items: [
      { page: 'Transfer Tickets', icon: 'arrowRightLeft' },
    ],
  },
  {
    label: 'More',
    items: [
      { page: 'Documents', icon: 'fileText' },
      { page: 'Reports', icon: 'barChart' },
      { page: 'Analytics', icon: 'chartPie' },
      { page: 'Settings', icon: 'settings' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { page: 'My Profile', icon: 'user' },
      { page: 'Notice Board', icon: 'megaphone' },
      { page: 'Helpdesk', icon: 'lifeBuoy' },
      { page: 'Leave Approvals', icon: 'clipboardList' },
      { page: 'Org Chart', icon: 'sitemap' },
      { page: 'Offboarding', icon: 'userMinus' },
    ],
  },
];

/** Flat page → icon lookup (used by the router and page headers). */
export const PAGE_ICON: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.page, i.icon] as const)),
);

/** Every page the app can render, so guards can reject unknown routes. */
export const ALL_PAGES: string[] = NAV.flatMap((g) => g.items.map((i) => i.page));

/** Page → route path, used by the sidebar and the router. */
export const PAGE_PATH: Record<string, string> = {
  Dashboard: '/',
  Employees: '/employees',
  Attendance: '/attendance',
  Leave: '/leave',
  Payroll: '/payroll',
  Recruitment: '/recruitment',
  Performance: '/performance',
  Projects: '/projects',
  Documents: '/documents',
  Reports: '/reports',
  Analytics: '/analytics',
  Settings: '/settings',
  'My Profile': '/profile',
  'Notice Board': '/notice-board',
  Helpdesk: '/helpdesk',
  'Leave Approvals': '/leave-approvals',
  'Org Chart': '/org-chart',
  Offboarding: '/offboarding',
  'Transfer Tickets': '/transfer-tickets',
  'Transfer Ticket Detail': '/transfer-tickets/:id',
  'My Transfer Status': '/my-transfer-status',
};

export const PATH_PAGE: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_PATH).map(([page, path]) => [path, page]),
);

/* ------------------------------------------------------------
   Role → portal & allowed pages
   `null` means "everything" (the HR portal sees the full suite).
   ------------------------------------------------------------ */

const PAGES_MANAGER = [
  'Dashboard',
  'Employees',
  'Attendance',
  'Leave',
  'Leave Approvals',
  'Projects',
  'Performance',
  'Notice Board',
  'Helpdesk',
  'Org Chart',
  'My Profile',
  'Transfer Tickets',
];

const PAGES_EMPLOYEE = [
  'Dashboard',
  'My Profile',
  'Attendance',
  'Leave',
  'Payroll',
  'Projects',
  'Documents',
  'Notice Board',
  'Helpdesk',
  'Org Chart',
  'My Transfer Status',
];

export function portalForRole(role: Role): Portal {
  if (role === 'MANAGER') return 'manager';
  if (role === 'EMPLOYEE') return 'employee';
  return 'hr';
}

/** The pages a role may open. `null` = no restriction. */
export function allowedPages(role: Role): string[] | null {
  const portal = portalForRole(role);
  if (portal === 'manager') return PAGES_MANAGER;
  if (portal === 'employee') return PAGES_EMPLOYEE;
  return null;
}

export function canVisit(role: Role, page: string): boolean {
  const allowed = allowedPages(role);
  return allowed === null || allowed.includes(page);
}

/** Salary, payroll totals and cost data are for HR/Admin eyes only. */
export function canSeeSalary(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR';
}

/** HR/Admin may manage people & settings; managers act on their team. */
export function canManagePeople(role: Role): boolean {
  return canSeeSalary(role);
}

/* ------------------------------------------------------------
   Portal-specific page labels — "Employees" reads "My Team"
   for a manager and screens become self-service for employees.
   ------------------------------------------------------------ */

export const PAGE_LABELS: Record<Portal, Record<string, string>> = {
  hr: {
    'Transfer Tickets': 'Transfer Tickets',
  },
  manager: {
    Employees: 'My Team',
    Attendance: 'Team Attendance',
    Leave: 'Team Leave',
    'Transfer Tickets': 'Transfer Requests',
  },
  employee: {
    Attendance: 'My Attendance',
    Leave: 'My Leave',
    Payroll: 'My Payroll',
    Projects: 'My Projects',
    'My Transfer Status': 'My Transfer Status',
  },
};

export function pageLabel(portal: Portal, page: string): string {
  return PAGE_LABELS[portal][page] ?? page;
}

/** Sidebar sections for the given role, with labels applied. */
export function navForRole(role: Role): NavGroup[] {
  const portal = portalForRole(role);
  const allowed = allowedPages(role);
  return NAV.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => allowed === null || allowed.includes(item.page))
      .map((item) => ({ ...item, page: item.page, label: pageLabel(portal, item.page) })),
  })).filter((group) => group.items.length > 0);
}
