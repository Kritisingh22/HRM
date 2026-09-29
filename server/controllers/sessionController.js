/* LoginSession API — login/logout activity, server-computed working time, and
 * (permission-gated) GPS captured at login. Visibility follows the same
 * ownership rules as everything else: Employee sees only their own; Manager
 * sees their team; HR sees their assigned employees (+ any live access-request
 * grant); Admin sees all. Never trusts a client-supplied duration or session id
 * belonging to someone else — every query is filtered by the caller's scope. */
const LoginSession = require('../models/LoginSession');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { teamEmployeeIds } = require('../utils/teamScope');

/* GET /api/sessions/me — the caller's current/most recent session, with a
 * live duration if still Active (computed from server time, not stored). */
exports.me = catchAsync(async (req, res) => {
  const session = await LoginSession.findOne({ user: req.user._id }).sort({ loginAt: -1 });
  res.json({ session: session ? session.toSafeJSON() : null });
});

/* PATCH /api/sessions/me/location — attach a GPS reading to the caller's
 * current Active session. Separate from login because the browser's
 * geolocation permission prompt often resolves asynchronously after the page
 * has already loaded and the login call has already completed. */
exports.updateMyLocation = catchAsync(async (req, res) => {
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw ApiError.badRequest('Valid latitude/longitude are required.');
  }
  const accuracy = Number(req.body.accuracy);

  const session = await LoginSession.findOne({ user: req.user._id, status: 'Active' }).sort({ loginAt: -1 });
  if (!session) throw ApiError.notFound('No active session to attach location to.');

  session.gps = {
    latitude: lat,
    longitude: lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
    capturedAt: new Date(),
  };
  await session.save();
  res.json({ session: session.toSafeJSON() });
});

/* GET /api/sessions — HR/Manager/Admin view of login activity for the
 * employees they are authorized to see. Query params: employeeId, from, to. */
exports.list = catchAsync(async (req, res) => {
  const role = req.user.role;
  let employeeIdFilter = null; // array of employeeId strings, or null = no restriction (Admin)

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    employeeIdFilter = null;
  } else if (role === 'HR' || role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    const emps = await Employee.find({ _id: { $in: ids } }).select('employeeId');
    employeeIdFilter = emps.map((e) => e.employeeId);
  } else {
    employeeIdFilter = [req.user.employeeId].filter(Boolean);
  }

  const filter = {};
  if (employeeIdFilter) filter.employeeId = { $in: employeeIdFilter };
  if (req.query.employeeId) {
    // Narrow further, but never outside what this caller is already scoped to.
    if (employeeIdFilter && !employeeIdFilter.includes(req.query.employeeId)) {
      throw ApiError.forbidden('You are not authorized to view this employee\'s login activity.');
    }
    filter.employeeId = req.query.employeeId;
  }
  if (req.query.from || req.query.to) {
    filter.loginAt = {};
    if (req.query.from) filter.loginAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.loginAt.$lte = new Date(req.query.to);
  }

  const sessions = await LoginSession.find(filter).sort({ loginAt: -1 }).limit(500);
  res.json({ count: sessions.length, sessions: sessions.map((s) => s.toSafeJSON()) });
});
