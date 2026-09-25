/* Central navigation config — the single source of truth for which portal pages
 * each role may see. The server returns this per-user so the frontend renders a
 * role's portal from config, not scattered hardcoded checks. Page keys match the
 * served portal's nav data-page values (and the React client's routes).
 *
 * This drives what is SHOWN. What a user may DO/READ is enforced independently by
 * the API guards + object-level checks — hiding a page is never the security boundary.
 */
const FULL = [
  'Dashboard', 'Employees', 'Attendance', 'Leave', 'Leave Approvals', 'Payroll',
  'Recruitment', 'Performance', 'Projects', 'Documents', 'Reports', 'Analytics',
  'Notice Board', 'Helpdesk', 'Org Chart', 'Offboarding', 'Settings', 'My Profile'
];

const NAV = {
  SUPER_ADMIN: FULL,
  ADMIN: FULL,
  HR: FULL,
  MANAGER: [
    'Dashboard', 'Employees', 'Attendance', 'Leave', 'Leave Approvals',
    'Projects', 'Performance', 'Documents', 'Notice Board', 'Helpdesk', 'Org Chart', 'My Profile'
  ],
  EMPLOYEE: [
    'Dashboard', 'Attendance', 'Leave', 'Payroll', 'Projects',
    'Documents', 'Notice Board', 'Helpdesk', 'Org Chart', 'My Profile'
  ]
};

// which portal a role lands in (used by the React client's redirect)
const PORTAL = { SUPER_ADMIN: 'hr', ADMIN: 'hr', HR: 'hr', MANAGER: 'manager', EMPLOYEE: 'employee' };

function navFor(role) { return NAV[role] || NAV.EMPLOYEE; }
function portalFor(role) { return PORTAL[role] || 'employee'; }

module.exports = { NAV, navFor, portalFor };
