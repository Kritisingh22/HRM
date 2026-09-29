/* Attendance API. Employees see their own; managers their team; HR their
 * assigned employees (+ any live access-request grant); Admin all.
 * Writing attendance requires attendance:write AND — for non-admins — that the
 * target employee is within the caller's own scope (this used to be missing:
 * any HR/Manager with attendance:write could edit ANY employee's record by id). */
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { userHasPermission } = require("../utils/permissions");
// Shared scoping (single source of truth) — replaces this file's own local
// hrAssignedIds, which duplicated the logic AND didn't honor an approved
// cross-HR access-request grant the way the shared util now does.
const { SEES_ALL, teamEmployeeIds } = require("../utils/teamScope");

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

// True if `employeeObjectId` is within this caller's authorized scope
// (self, own team, assigned employees, or a live access-request grant).
async function inScope(user, employeeObjectId) {
  if (SEES_ALL.includes(user.role)) return true;
  const ids = await teamEmployeeIds(user);
  return ids.some((id) => String(id) === String(employeeObjectId));
}

/* GET /api/attendance */
exports.list = catchAsync(async (req, res) => {
  // Check permission
  if (
    !userHasPermission(req.user, "attendance:read") &&
    !userHasPermission(req.user, "attendance:read_own")
  ) {
    throw ApiError.forbidden(
      "You do not have permission to view attendance records.",
    );
  }

  let filter = {};
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, "attendance:read")
  ) {
    if (req.query.employee) filter.employee = req.query.employee;
  } else if (req.user.role === "HR" || req.user.role === "MANAGER") {
    const ids = await teamEmployeeIds(req.user);
    if (req.query.employee) {
      // Narrow further, but never outside what this caller can already see.
      if (!ids.some((id) => String(id) === String(req.query.employee))) {
        throw ApiError.forbidden("You are not authorized to view this employee's attendance.");
      }
      filter.employee = req.query.employee;
    } else {
      filter.employee = { $in: ids };
    }
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }
  if (req.query.date) filter.date = req.query.date;
  const records = await Attendance.find(filter)
    .populate("employee", "employeeId fullName")
    .sort({ date: -1 })
    .limit(1000);
  res.json({ count: records.length, attendance: records });
});

/* POST /api/attendance — upsert one record (attendance:write) */
exports.upsert = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, "attendance:write")) {
    throw ApiError.forbidden(
      "You do not have permission to create/update attendance records.",
    );
  }

  const { employee, date } = req.body;
  if (!employee || !date)
    throw ApiError.badRequest("employee and date are required.");

  // IDOR check: attendance:write does not mean "write for anyone" — a non-admin
  // may only write attendance for an employee within their own scope.
  if (!(await inScope(req.user, employee))) {
    throw ApiError.forbidden("You are not authorized to modify this employee's attendance.");
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
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }, // enforce the status enum on this update path
  );
  res.status(201).json({ attendance: rec });
});

/* PUT /api/attendance/:id (attendance:write) */
exports.update = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, "attendance:write")) {
    throw ApiError.forbidden(
      "You do not have permission to update attendance records.",
    );
  }

  const rec = await Attendance.findById(req.params.id);
  if (!rec) throw ApiError.notFound("Attendance record not found.");

  // IDOR check: this record's employee must be within the caller's own scope.
  if (!(await inScope(req.user, rec.employee))) {
    throw ApiError.forbidden("You are not authorized to modify this employee's attendance.");
  }

  ["status", "checkIn", "checkOut", "note"].forEach((k) => {
    if (req.body[k] !== undefined) rec[k] = req.body[k];
  });
  await rec.save();
  res.json({ attendance: rec });
});

/* GET /api/attendance/weekly-summary?employeeId=&weeks=8 — real, derived
 * weekly summaries (requirement #20). Same scoping as everything else: self,
 * team, assigned employees (+ live access grant), or all for admins. */
exports.weeklySummary = catchAsync(async (req, res) => {
  const WeeklyAttendanceSummary = require("../models/WeeklyAttendanceSummary");
  let employeeObjectId;

  if (req.query.employeeId) {
    const target = await Employee.findOne({ employeeId: req.query.employeeId });
    if (!target) throw ApiError.notFound("Employee not found.");
    if (!(await inScope(req.user, target._id))) {
      throw ApiError.forbidden("You are not authorized to view this employee's attendance summary.");
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

/* POST /api/attendance/weekly-summary/run — manually (re)run the derivation
 * (Admin only). Same idempotent upsert the scheduled job uses — safe to call
 * any number of times (requirement #21). Mainly for ops/testing since the
 * scheduler already runs this weekly. */
exports.runWeeklySummary = catchAsync(async (req, res) => {
  if (!SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden("Only an admin can manually trigger the weekly attendance job.");
  }
  const { computeWeeklySummariesForAllEmployees } = require("../utils/weeklyAttendance");
  const referenceDate = req.body.referenceDate ? new Date(req.body.referenceDate) : new Date();
  const results = await computeWeeklySummariesForAllEmployees(referenceDate);
  res.json({ ok: true, count: results.length });
});

/* GET /api/attendance/me?month=YYYY-MM  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The caller's own attendance (defaults to the current month). Used by the
 * Attendance Register UI's "self" view — always the CALLER's own record, never
 * dependent on any client-supplied employeeId. */
exports.me = catchAsync(async (req, res) => {
  const me = await myEmployee(req.user);
  if (!me) return res.json({ employeeId: null, attendance: [] });

  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  let from, to;
  if (isDay(req.query.from) && isDay(req.query.to)) {
    from = req.query.from;
    to = req.query.to;
  } else {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || "")
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
    from = `${month}-01`;
    to = `${month}-31`;
  }

  const records = await Attendance.find({
    employee: me._id,
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });

  res.json({ employeeId: me.employeeId, from, to, attendance: records });
});
