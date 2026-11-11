/* Attendance API — mandatory check-in with location verification,
 * active-time-only tracking via server-computed heartbeats, and HR
 * geofence/session settings.
 *
 * Security principles (all enforced server-side):
 *  • The employee identity ALWAYS comes from the verified JWT (req.user),
 *    never from the request body.
 *  • Check-in/check-out timestamps are minted by the server clock.
 *  • Geofence (Haversine) is computed server-side from lat/lng sent by the
 *    client; the client cannot influence whether it is "in range".
 *  • activeSeconds / pausedSeconds are computed from heartbeat sessions;
 *    the client is never trusted for the final duration.
 *  • Row-level scoping: employees see only themselves, managers their team,
 *    HR their assigned employees, admins everything.
 */
'use strict';

const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceSettings = require('../models/AttendanceSettings');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userHasPermission } = require('../utils/permissions');
const { logAudit } = require('../utils/audit');
const { SEES_ALL, teamEmployeeIds } = require('../utils/teamScope');
const { checkGeofence } = require('../utils/geofence');

/* ---- in-memory cache for AttendanceSettings (60s TTL) ---- */
const SETTINGS_CACHE_TTL_MS = 60_000;
let settingsCache = { value: null, fetchedAt: 0 };

async function getCachedSettings() {
  const now = Date.now();
  if (settingsCache.value && now - settingsCache.fetchedAt < SETTINGS_CACHE_TTL_MS) {
    return settingsCache.value;
  }
  const settings = await AttendanceSettings.findOne({ _id: 'singleton' }).lean();
  settingsCache = { value: settings, fetchedAt: now };
  return settings;
}

function invalidateSettingsCache() {
  settingsCache = { value: null, fetchedAt: 0 };
}

/* ---- helpers ---- */

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  }).select('_id employeeId').lean();
}

async function inScope(user, employeeObjectId) {
  if (SEES_ALL.includes(user.role)) return true;
  const ids = await teamEmployeeIds(user);
  return ids.some((id) => String(id) === String(employeeObjectId));
}

function serverNow() {
  return new Date();
}

function serverTimeStr() {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function serverDateStr() {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Close any open (end === null) session at `at`, return the closed sessions. */
function closeOpenSession(sessions, at) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (!sessions[i].end) {
      sessions[i].end = at;
      break;
    }
  }
  return sessions;
}

/** Recompute activeSeconds / pausedSeconds from closed sessions. */
function computeTotals(sessions) {
  let active = 0;
  let paused = 0;
  for (const s of sessions) {
    if (!s.start || !s.end) continue;
    const secs = Math.max(0, (s.end.getTime() - s.start.getTime()) / 1000);
    if (s.state === 'active') active += secs;
    else if (s.state === 'paused') paused += secs;
  }
  return { activeSeconds: Math.floor(active), pausedSeconds: Math.floor(paused) };
}

/** Determine final day status from active seconds + geofence + settings. */
function computeStatus({ activeSeconds, geofence, settings, checkIn }) {
  if (!checkIn) return 'absent';
  if (geofence && geofence.inRange === false && settings && settings.blockOutsideLocation) {
    return 'outside-location';
  }
  const minActive = settings && settings.minActiveHours ? settings.minActiveHours * 3600 : 8 * 3600;
  const half = minActive / 2;
  if (activeSeconds >= minActive) return 'present';
  if (activeSeconds >= half) return 'half-day';
  return 'absent';
}

/* ---- GET /api/attendance/me — caller's own attendance + active state ---- */
exports.me = catchAsync(async (req, res) => {
  const me = await myEmployee(req.user);
  if (!me) return res.json({ employeeId: null, attendance: [], settings: null });

  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  let from, to;
  if (isDay(req.query.from) && isDay(req.query.to)) {
    from = req.query.from;
    to = req.query.to;
  } else {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
    from = `${month}-01`;
    to = `${month}-31`;
  }

  const records = await Attendance.find({
    employee: me._id,
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });

  const settings = await getCachedSettings();
  const today = serverDateStr();
  const todayRow = records.find((r) => r.date === today);

  // Active session state for the gate / timer UI.
  const hasOpenSession = Boolean(
    todayRow && todayRow.sessions && todayRow.sessions.some((s) => !s.end),
  );

  res.json({
    employeeId: me.employeeId,
    from,
    to,
    attendance: records,
    settings,
    todayRow,
    hasOpenSession,
    checkedInToday: Boolean(todayRow && todayRow.checkIn),
  });
});

/* ---- POST /api/attendance/check-in — mandatory check-in ---- */
exports.checkIn = catchAsync(async (req, res) => {
  // Run independent lookups in parallel: employee, today's attendance, settings.
  const [me, rec, settings] = await Promise.all([
    Employee.findOne({
      $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }],
    }).select('_id employeeId').lean(),
    Attendance.findOne({ employee: req.user._id, date: serverDateStr() }).lean(),
    getCachedSettings(),
  ]);

  if (!me) throw ApiError.badRequest('No employee record is linked to your account.');
  if (rec && rec.checkIn) {
    throw ApiError.conflict('You have already checked in today.');
  }

  const date = serverDateStr();
  const time = serverTimeStr();
  const now = serverNow();

  // ---- consent & geolocation (mandatory) ----
  const { consentGiven, lat, lng, accuracy } = req.body || {};
  if (!consentGiven) {
    throw ApiError.badRequest(
      'Consent is required before check-in. The portal records tab visibility/focus and your location at check-in only — no background tracking.',
    );
  }
  if (lat == null || lng == null) {
    throw ApiError.badRequest(
      'Location permission is required. Allow geolocation in your browser (site settings → Location → Allow) and check in again.',
    );
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw ApiError.badRequest('Invalid location coordinates.');
  }

  // ---- geofence (server-computed) ----
  const geofence = checkGeofence(latitude, longitude, settings);

  // If out of range and blocking is enabled, still record but flag outside-location.
  // (The client gate decides whether to show the check-in button based on this.)

  const status = (req.body && req.body.status === "wfh") ? "wfh" : (geofence.inRange || !settings?.blockOutsideLocation ? "present" : "outside-location");

  const checkInDetail = {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined,
    ip: req.ip,
    device: req.headers['user-agent'] || '',
    capturedAt: now,
  };

  const sessions = [{ start: now, end: null, state: 'active', reason: 'check-in' }];

  let createdId;
  if (!rec) {
    const created = await Attendance.create({
      employee: me._id,
      date,
      status,
      checkIn: time,
      checkInDetail,
      location: { lat: latitude, lng: longitude },
      geofence,
      sessions,
      consentGiven: true,
      consentAt: now,
      lastHeartbeatAt: now,
      activeSeconds: 0,
      pausedSeconds: 0,
    });
    createdId = created._id;
  } else {
    rec.status = status;
    rec.checkIn = time;
    rec.checkInDetail = checkInDetail;
    rec.location = { lat: latitude, lng: longitude };
    rec.geofence = geofence;
    rec.sessions = sessions;
    rec.consentGiven = true;
    rec.consentAt = now;
    rec.lastHeartbeatAt = now;
    rec.activeSeconds = 0;
    rec.pausedSeconds = 0;
    await rec.save();
    createdId = rec._id;
  }

  // Fire-and-forget: don't block the response on audit/event writes.
  AttendanceEvent.create({
    employee: me._id,
    date,
    type: 'check-in',
    reason: 'check-in',
    at: now,
    details: { geofence, distanceMeters: geofence.distanceMeters },
  }).catch((e) => console.error('[checkin] AttendanceEvent.create failed:', e.message));

  logAudit(req, {
    action: 'attendance.check_in',
    targetType: 'Attendance',
    targetId: String(createdId),
    description: `Checked in at ${time} on ${date} (${geofence.inRange ? 'in-range' : 'out-of-range'})`,
  });

  res.status(201).json({ attendance: { _id: createdId, ...(rec || {}), date, status, checkIn: time }, settings, geofence });
});

/* ---- POST /api/attendance/heartbeat — client heartbeat (active/paused) ---- */
exports.heartbeat = catchAsync(async (req, res) => {
  const me = await myEmployee(req.user);
  if (!me) throw ApiError.badRequest('No employee record is linked to your account.');

  const date = serverDateStr();
  const now = serverNow();
  const { state, reason } = req.body || {};
  if (state !== 'active' && state !== 'paused') {
    throw ApiError.badRequest("state must be 'active' or 'paused'.");
  }

  const settings = await getCachedSettings();
  const rec = await Attendance.findOne({ employee: me._id, date });
  if (!rec || !rec.checkIn) {
    throw ApiError.badRequest('Check in first before sending heartbeats.');
  }

  const sessions = rec.sessions || [];
  const last = sessions[sessions.length - 1];

  // If a previous session is still open, close it. If there was a gap longer
  // than the session timeout, close at the last heartbeat (do not count gap).
  if (last && !last.end) {
    let closeAt = now;
    if (rec.lastHeartbeatAt) {
      const gapMs = now.getTime() - rec.lastHeartbeatAt.getTime();
      const timeoutMs = ((settingsTimeout(settings) || 90) * 1000);
      if (gapMs > timeoutMs) {
        closeAt = rec.lastHeartbeatAt;
        // Record an offline gap event
        AttendanceEvent.create({
          employee: me._id,
          date,
          type: 'offline',
          reason: 'offline',
          at: rec.lastHeartbeatAt,
          details: { gapSeconds: Math.floor(gapMs / 1000) },
        }).catch((e) => console.error('[heartbeat] AttendanceEvent.create failed:', e.message));
      }
    }
    last.end = closeAt;
  }

  // Push the new session (open, no end yet).
  sessions.push({ start: now, end: null, state, reason: reason || (state === 'paused' ? 'idle' : 'resume') });

  const totals = computeTotals(sessions);

  rec.sessions = sessions;
  rec.lastHeartbeatAt = now;
  rec.activeSeconds = totals.activeSeconds;
  rec.pausedSeconds = totals.pausedSeconds;
  rec.status = computeStatus({
    activeSeconds: totals.activeSeconds,
    geofence: rec.geofence,
    settings,
    checkIn: rec.checkIn,
  });
  await rec.save();

  AttendanceEvent.create({
    employee: me._id,
    date,
    type: state === 'paused' ? 'pause' : 'resume',
    reason: reason || (state === 'paused' ? 'idle' : 'resume'),
    at: now,
    details: { state, activeSeconds: totals.activeSeconds, pausedSeconds: totals.pausedSeconds },
  }).catch((e) => console.error('[heartbeat] AttendanceEvent.create failed:', e.message));

  res.json({
    attendance: rec,
    activeSeconds: totals.activeSeconds,
    pausedSeconds: totals.pausedSeconds,
    status: rec.status,
  });
});

function settingsTimeout(settings) {
  return settings && settings.sessionTimeoutSeconds ? settings.sessionTimeoutSeconds : 90;
}

/* ---- POST /api/attendance/pause — explicit pause ---- */
exports.pause = catchAsync(async (req, res) => {
  const me = await myEmployee(req.user);
  if (!me) throw ApiError.badRequest('No employee record is linked to your account.');

  const date = serverDateStr();
  const now = serverNow();
  const { reason } = req.body || {};

  const rec = await Attendance.findOne({ employee: me._id, date });
  if (!rec || !rec.checkIn) {
    throw ApiError.badRequest('Check in first before pausing.');
  }

  const sessions = rec.sessions || [];
  const last = sessions[sessions.length - 1];
  if (last && !last.end) last.end = now;

  sessions.push({ start: now, end: null, state: 'paused', reason: reason || 'idle' });

  const totals = computeTotals(sessions);
  rec.sessions = sessions;
  rec.lastHeartbeatAt = now;
  rec.pausedSeconds = totals.pausedSeconds;
  rec.activeSeconds = totals.activeSeconds;
  rec.status = computeStatus({
    activeSeconds: totals.activeSeconds,
    geofence: rec.geofence,
    settings: null,
    checkIn: rec.checkIn,
  });
  await rec.save();

  AttendanceEvent.create({
    employee: me._id,
    date,
    type: 'pause',
    reason: reason || 'idle',
    at: now,
    details: { state: 'paused' },
  }).catch((e) => console.error('[pause] AttendanceEvent.create failed:', e.message));

  logAudit(req, {
    action: 'attendance.pause',
    targetType: 'Attendance',
    targetId: String(rec._id),
    description: `Paused at ${serverTimeStr()} (${reason || 'idle'})`,
  });

  res.json({ attendance: rec, activeSeconds: totals.activeSeconds, pausedSeconds: totals.pausedSeconds });
});

/* ---- POST /api/attendance/check-out ---- */
exports.checkOut = catchAsync(async (req, res) => {
  const me = await myEmployee(req.user);
  if (!me) throw ApiError.badRequest('No employee record is linked to your account.');

  const date = serverDateStr();
  const time = serverTimeStr();
  const now = serverNow();

  const rec = await Attendance.findOne({ employee: me._id, date });
  if (!rec || !rec.checkIn) {
    throw ApiError.badRequest('Check in first, then check out.');
  }
  if (rec.checkOut) {
    throw ApiError.conflict('You have already checked out today.');
  }

  // ---- optional geolocation at check-out ----
  const { lat, lng, accuracy } = req.body || {};
  let geofenceOut = null;
  if (lat != null && lng != null) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const settings = await getCachedSettings();
      geofenceOut = checkGeofence(latitude, longitude, settings);
    }
  }

  const checkOutDetail = {
    lat: geofenceOut ? Number(lat) : undefined,
    lng: geofenceOut ? Number(lng) : undefined,
    accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined,
    ip: req.ip,
    device: req.headers['user-agent'] || '',
    capturedAt: now,
  };

  // Close all open sessions at now.
  const sessions = rec.sessions || [];
  closeOpenSession(sessions, now);
  const totals = computeTotals(sessions);

  const settings = await getCachedSettings();
  const status = computeStatus({
    activeSeconds: totals.activeSeconds,
    geofence: rec.geofence,
    settings,
    checkIn: rec.checkIn,
  });

  rec.checkOut = time;
  rec.checkOutDetail = checkOutDetail;
  rec.sessions = sessions;
  rec.lastHeartbeatAt = now;
  rec.activeSeconds = totals.activeSeconds;
  rec.pausedSeconds = totals.pausedSeconds;
  rec.status = status;
  await rec.save();

  AttendanceEvent.create({
    employee: me._id,
    date,
    type: 'check-out',
    reason: 'check-out',
    at: now,
    details: { activeSeconds: totals.activeSeconds, pausedSeconds: totals.pausedSeconds, geofence: geofenceOut },
  }).catch((e) => console.error('[checkout] AttendanceEvent.create failed:', e.message));

  logAudit(req, {
    action: 'attendance.check_out',
    targetType: 'Attendance',
    targetId: String(rec._id),
    description: `Checked out at ${time} on ${date} — active ${Math.floor(totals.activeSeconds / 3600)}h ${Math.floor((totals.activeSeconds % 3600) / 60)}m`,
  });

  res.json({ attendance: rec, activeSeconds: totals.activeSeconds, pausedSeconds: totals.pausedSeconds, status });
});

/* ---- GET /api/attendance — scoped list with filters ---- */
exports.list = catchAsync(async (req, res) => {
  if (
    !userHasPermission(req.user, 'attendance:read') &&
    !userHasPermission(req.user, 'attendance:read_own')
  ) {
    throw ApiError.forbidden('You do not have permission to view attendance records.');
  }

  let filter = {};
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, 'attendance:read')
  ) {
    if (req.query.employee) filter.employee = req.query.employee;
  } else if (req.user.role === 'HR' || req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    if (req.query.employee) {
      if (!ids.some((id) => String(id) === String(req.query.employee))) {
        throw ApiError.forbidden('You are not authorized to view this employee\'s attendance.');
      }
      filter.employee = req.query.employee;
    } else {
      filter.employee = { $in: ids };
    }
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }

  if (req.query.from && req.query.to) {
    filter.date = { $gte: req.query.from, $lte: req.query.to };
  } else if (req.query.date) {
    filter.date = req.query.date;
  }
  if (req.query.status) filter.status = req.query.status;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 100));
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .populate('employee', 'employeeId fullName department designation')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter),
  ]);

  res.json({ count: records.length, total, page, pages: Math.ceil(total / limit), attendance: records });
});

/* ---- GET /api/attendance/settings — HR/Manager read ---- */
exports.getSettings = catchAsync(async (req, res) => {
  if (
    !userHasPermission(req.user, 'attendance:read') &&
    !userHasPermission(req.user, 'attendance:read_own')
  ) {
    throw ApiError.forbidden('You do not have permission to view attendance settings.');
  }
  const settings = await getCachedSettings();
  if (!settings) {
    return res.json({ settings: null });
  }
  res.json({ settings });
});

/* ---- POST /api/attendance/settings — HR write (attendance:settings) ---- */
exports.updateSettings = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'attendance:settings')) {
    throw ApiError.forbidden('Only HR can configure attendance settings.');
  }

  const {
    officeLat,
    officeLng,
    radiusMeters,
    workStart,
    workEnd,
    minActiveHours,
    blockOutsideLocation,
    idleMinutes,
    heartbeatIntervalSeconds,
    sessionTimeoutSeconds,
  } = req.body || {};

  const settings = await AttendanceSettings.findOneAndUpdate(
    { _id: 'singleton' },
    {
      $set: {
        ...(officeLat != null ? { officeLat: Number(officeLat) } : {}),
        ...(officeLng != null ? { officeLng: Number(officeLng) } : {}),
        ...(radiusMeters != null ? { radiusMeters: Number(radiusMeters) } : {}),
        ...(workStart != null ? { workStart: String(workStart) } : {}),
        ...(workEnd != null ? { workEnd: String(workEnd) } : {}),
        ...(minActiveHours != null ? { minActiveHours: Number(minActiveHours) } : {}),
        ...(blockOutsideLocation != null ? { blockOutsideLocation: Boolean(blockOutsideLocation) } : {}),
        ...(idleMinutes != null ? { idleMinutes: Number(idleMinutes) } : {}),
        ...(heartbeatIntervalSeconds != null ? { heartbeatIntervalSeconds: Number(heartbeatIntervalSeconds) } : {}),
        ...(sessionTimeoutSeconds != null ? { sessionTimeoutSeconds: Number(sessionTimeoutSeconds) } : {}),
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  invalidateSettingsCache();

  logAudit(req, {
    action: 'attendance.settings_update',
    targetType: 'AttendanceSettings',
    targetId: String(settings._id),
    description: `Updated attendance settings (radius=${settings.radiusMeters}m, minActive=${settings.minActiveHours}h, blockOutside=${settings.blockOutsideLocation})`,
  });

  res.json({ settings });
});

/* ---- existing upsert / update / weekly-summary (unchanged behaviour) ---- */
exports.upsert = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'attendance:write')) {
    throw ApiError.forbidden('You do not have permission to create/update attendance records.');
  }

  const { employee, date } = req.body;
  if (!employee || !date)
    throw ApiError.badRequest('employee and date are required.');

  if (!(await inScope(req.user, employee))) {
    throw ApiError.forbidden('You are not authorized to modify this employee\'s attendance.');
  }

  const rec = await Attendance.findOneAndUpdate(
    { employee, date },
    {
      $set: {
        status: req.body.status,
        checkIn: req.body.checkIn,
        checkOut: req.body.checkOut,
        note: req.body.note,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );
  res.status(201).json({ attendance: rec });
});

exports.update = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'attendance:write')) {
    throw ApiError.forbidden('You do not have permission to update attendance records.');
  }

  const rec = await Attendance.findById(req.params.id);
  if (!rec) throw ApiError.notFound('Attendance record not found.');

  if (!(await inScope(req.user, rec.employee))) {
    throw ApiError.forbidden('You are not authorized to modify this employee\'s attendance.');
  }

  ['status', 'checkIn', 'checkOut', 'note'].forEach((k) => {
    if (req.body[k] !== undefined) rec[k] = req.body[k];
  });
  await rec.save();
  res.json({ attendance: rec });
});

exports.weeklySummary = catchAsync(async (req, res) => {
  const WeeklyAttendanceSummary = require('../models/WeeklyAttendanceSummary');
  let employeeObjectId;

  if (req.query.employeeId) {
    const target = await Employee.findOne({ employeeId: req.query.employeeId });
    if (!target) throw ApiError.notFound('Employee not found.');
    if (!(await inScope(req.user, target._id))) {
      throw ApiError.forbidden('You are not authorized to view this employee\'s attendance summary.');
    }
    employeeObjectId = target._id;
  } else {
    const me = await myEmployee(req.user);
    if (!me) return res.json({ summaries: [] });
    employeeObjectId = me._id;
  }

  const limit = Math.min(Number(req.query.weeks) || 8, 52);
  const summaries = await WeeklyAttendanceSummary.find({ employee: employeeObjectId })
    .sort({ weekStart: -1 })
    .limit(limit);
  res.json({ count: summaries.length, summaries });
});

exports.runWeeklySummary = catchAsync(async (req, res) => {
  if (!SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden('Only an admin can manually trigger the weekly attendance job.');
  }
  const { computeWeeklySummariesForAllEmployees } = require('../utils/weeklyAttendance');
  const referenceDate = req.body.referenceDate ? new Date(req.body.referenceDate) : new Date();
  const results = await computeWeeklySummariesForAllEmployees(referenceDate);
  res.json({ ok: true, count: results.length });
});
