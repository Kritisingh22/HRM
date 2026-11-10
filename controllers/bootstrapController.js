/* GET /api/bootstrap — one round-trip payload used for the first paint.

Returns the current user, their permissions/nav, the unread notification
count, and role-scoped dashboard KPIs. Auth is required; unauthenticated
callers get 401 so the client can skip the whole chain and stay on login.
Identity and scope always come from req.user (set by authenticate), never
from the client. */
const Notification = require('../models/Notification');
const dashboard = require('./dashboardController');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

exports.summary = catchAsync(async (req, res) => {
  const user = req.user;
  const rolePerms = require('../utils/permissions').permissionsFor(user.role);
  const userPerms = user.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...userPerms])];
  const { navFor, portalFor } = require('../utils/navigation');
  const unreadCount = await Notification.countDocuments({ user: user._id, read: false });

  /* Reuse the dashboard summary so bootstrap + dashboard stay in sync. */
  let dashboardPayload;
  if (user.role === 'EMPLOYEE') {
    dashboardPayload = { scope: 'self', ...(await dashboard.employeeSummary(user)) };
  } else if (['HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    dashboardPayload = {
      scope: ['ADMIN', 'SUPER_ADMIN'].includes(user.role) ? 'company' : user.role === 'MANAGER' ? 'team' : 'assigned',
      ...(await dashboard.staffSummary(user)),
    };
  } else {
    throw ApiError.forbidden('No dashboard is available for your role.');
  }

  res.json({
    user: { ...user.toSafeJSON(), permissions: allPerms, nav: navFor(user.role), portal: portalFor(user.role) },
    unreadCount,
    dashboard: dashboardPayload,
  });
});
