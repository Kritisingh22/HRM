/* Attendance API. Employees see their own; managers their team; HR/Admin all.
 * Writing attendance requires attendance:write (HR/Admin). */
<<<<<<< HEAD
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
async function myEmployee(user) { return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }); }

/* GET /api/attendance */
exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (SEES_ALL.includes(req.user.role)) {
    if (req.query.employee) filter.employee = req.query.employee;
  } else if (req.user.role === 'MANAGER') {
    const team = await Employee.find({ manager: req.user.employeeId }).select('_id');
    const me = await myEmployee(req.user);
    const ids = team.map((e) => e._id); if (me) ids.push(me._id);
=======
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { userHasPermission } = require("../utils/permissions");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];
async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}
async function hrAssignedIds(user) {
  const rows = await Employee.find({ assignedHrId: user.employeeId }).select(
    "_id",
  );
  const me = await myEmployee(user);
  if (me) rows.push(me);
  return rows.map((e) => e._id);
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
  } else if (req.user.role === "HR") {
    const ids = await hrAssignedIds(req.user);
    filter.employee = { $in: ids };
  } else if (req.user.role === "MANAGER") {
    const team = await Employee.find({ manager: req.user.employeeId }).select(
      "_id",
    );
    const me = await myEmployee(req.user);
    const ids = team.map((e) => e._id);
    if (me) ids.push(me._id);
>>>>>>> 0f31467 (intial Update HRM 1.1)
    filter.employee = { $in: ids };
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }
  if (req.query.date) filter.date = req.query.date;
<<<<<<< HEAD
  const records = await Attendance.find(filter).populate('employee', 'employeeId fullName').sort({ date: -1 }).limit(1000);
=======
  const records = await Attendance.find(filter)
    .populate("employee", "employeeId fullName")
    .sort({ date: -1 })
    .limit(1000);
>>>>>>> 0f31467 (intial Update HRM 1.1)
  res.json({ count: records.length, attendance: records });
});

/* POST /api/attendance — upsert one record (attendance:write) */
exports.upsert = catchAsync(async (req, res) => {
<<<<<<< HEAD
  const { employee, date } = req.body;
  if (!employee || !date) throw ApiError.badRequest('employee and date are required.');
  const rec = await Attendance.findOneAndUpdate(
    { employee, date },
    { $set: { status: req.body.status, checkIn: req.body.checkIn, checkOut: req.body.checkOut, note: req.body.note } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true } // enforce the status enum on this update path
=======
  // Check permission
  if (!userHasPermission(req.user, "attendance:write")) {
    throw ApiError.forbidden(
      "You do not have permission to create/update attendance records.",
    );
  }

  const { employee, date } = req.body;
  if (!employee || !date)
    throw ApiError.badRequest("employee and date are required.");
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
>>>>>>> 0f31467 (intial Update HRM 1.1)
  );
  res.status(201).json({ attendance: rec });
});

/* PUT /api/attendance/:id (attendance:write) */
exports.update = catchAsync(async (req, res) => {
<<<<<<< HEAD
  const rec = await Attendance.findById(req.params.id);
  if (!rec) throw ApiError.notFound('Attendance record not found.');
  ['status', 'checkIn', 'checkOut', 'note'].forEach((k) => { if (req.body[k] !== undefined) rec[k] = req.body[k]; });
=======
  // Check permission
  if (!userHasPermission(req.user, "attendance:write")) {
    throw ApiError.forbidden(
      "You do not have permission to update attendance records.",
    );
  }

  const rec = await Attendance.findById(req.params.id);
  if (!rec) throw ApiError.notFound("Attendance record not found.");
  ["status", "checkIn", "checkOut", "note"].forEach((k) => {
    if (req.body[k] !== undefined) rec[k] = req.body[k];
  });
>>>>>>> 0f31467 (intial Update HRM 1.1)
  await rec.save();
  res.json({ attendance: rec });
});
