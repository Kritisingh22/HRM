/* Offboarding API. HR/Admin manage exits; employees can see their own.
 * Completing an exit deactivates the user account but never deletes records. */
const Offboarding = require('../models/Offboarding');
const Employee = require('../models/Employee');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
async function myEmployee(user) { return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }); }

exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (!SEES_ALL.includes(req.user.role)) { const me = await myEmployee(req.user); filter.employee = me ? me._id : null; }
  const records = await Offboarding.find(filter).populate('employee', 'employeeId fullName department').sort({ createdAt: -1 }).limit(500);
  res.json({ count: records.length, offboarding: records });
});

/* POST /api/offboarding  (offboarding:write) */
exports.initiate = catchAsync(async (req, res) => {
  if (!req.body.employee) throw ApiError.badRequest('employee is required.');
  const existing = await Offboarding.findOne({ employee: req.body.employee });
  if (existing) throw ApiError.conflict('Offboarding already exists for this employee.');
  const rec = await Offboarding.create({
    employee: req.body.employee, initiatedBy: req.user._id,
    reason: req.body.reason || 'Resignation', lastWorkingDate: req.body.lastWorkingDate
  });
  logAudit(req, { action: 'offboarding.initiate', targetType: 'Offboarding', targetId: rec._id, description: `Initiated offboarding for employee ${req.body.employee} (${rec.reason})` });
  res.status(201).json({ offboarding: rec });
});

/* PUT /api/offboarding/:id  (offboarding:write) */
exports.update = catchAsync(async (req, res) => {
  const rec = await Offboarding.findById(req.params.id);
  if (!rec) throw ApiError.notFound('Offboarding record not found.');
  ['reason', 'lastWorkingDate', 'status', 'clearance', 'finalSettlementRef', 'notes'].forEach((k) => { if (req.body[k] !== undefined) rec[k] = req.body[k]; });

  if (rec.status === 'Completed') {
    // deactivate the employee + their login, but KEEP all historical records
    const emp = await Employee.findById(rec.employee);
    if (emp) {
      emp.status = 'Exited'; await emp.save();
      if (emp.user) await User.findByIdAndUpdate(emp.user, { status: 'inactive' });
      logAudit(req, { action: 'offboarding.complete', targetType: 'Employee', targetId: emp.employeeId, description: `Completed offboarding for ${emp.employeeId} (marked Exited, login disabled)` });
    }
  }
  await rec.save();
  res.json({ offboarding: rec });
});
