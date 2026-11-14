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
const crypto = require('crypto');

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

  const body = {
    user: { ...user.toSafeJSON(), permissions: allPerms, nav: navFor(user.role), portal: portalFor(user.role) },
    unreadCount,
    dashboard: dashboardPayload,
  };

  /* ETag/304 support: if-none-match with the same body hash returns 304.
     Bootstrap is cacheable per-user for 10-30s — the client stores it in
     memory and only re-fetches on login/refresh. */
  const etag = '"' + crypto.createHash('md5').update(JSON.stringify(body)).digest('hex') + '"';
  if (req.get('if-none-match') === etag) {
    res.status(304).end();
    return;
  }
  res.set('etag', etag);
  res.set('cache-control', 'private, max-age=20'); // 20s per-user cache
  res.json(body);
});
