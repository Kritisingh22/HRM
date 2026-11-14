/* Offboarding API. HR/Admin manage exits; employees can see their own.
 * Completing an exit deactivates the user account but never deletes records. */
const Offboarding = require('../models/Offboarding');
const Employee = require('../models/Employee');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { calculateLastWorkingDay, validateLastWorkingDay } = require('../utils/noticePeriod');
const { teamEmployeeIds, managerScope } = require('../utils/teamScope');
const { completeOffboarding } = require('../services/offboardingService');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
async function myEmployee(user) { return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }); }

exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (SEES_ALL.includes(req.user.role)) {
    filter = {}; // HR/Admin/Super see everything
  } else if (req.user.role === 'MANAGER' && managerScope('offboarding') === 'team') {
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } }; // team-scoped: own + direct/indirect reports
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null; // own
  }
  const records = await Offboarding.find(filter).populate('employee', 'employeeId fullName department').sort({ createdAt: -1 }).limit(500);
  res.json({ count: records.length, offboarding: records });
});

/* POST /api/offboarding  (offboarding:write) */
exports.initiate = catchAsync(async (req, res) => {
  if (!req.body.employee) throw ApiError.badRequest('employee is required.');
  const existing = await Offboarding.findOne({ employee: req.body.employee });
  if (existing) throw ApiError.conflict('Offboarding already exists for this employee.');

  // Calculate last working date if resignation date and notice period provided
  let lastWorkingDate = req.body.lastWorkingDate;
  if (req.body.resignationDate && req.body.noticePeriod) {
    lastWorkingDate = calculateLastWorkingDay(req.body.resignationDate, req.body.noticePeriod);
  }

  const rec = await Offboarding.create({
    employee: req.body.employee,
    initiatedBy: req.user._id,
    reason: req.body.reason || 'Resignation',
    resignationDate: req.body.resignationDate,
    noticePeriod: req.body.noticePeriod,
    lastWorkingDate,
  });
  logAudit(req, { action: 'offboarding.initiate', targetType: 'Offboarding', targetId: rec._id, description: `Initiated offboarding for employee ${req.body.employee} (${rec.reason})` });
  res.status(201).json({ offboarding: rec });
});

/* PUT /api/offboarding/:id  (offboarding:write) */
exports.update = catchAsync(async (req, res) => {
  const rec = await Offboarding.findById(req.params.id);
  if (!rec) throw ApiError.notFound('Offboarding record not found.');

  // Track if resignationDate or noticePeriod changed
  const resignationDateChanged = req.body.resignationDate !== undefined && req.body.resignationDate !== rec.resignationDate;
  const noticePeriodChanged = req.body.noticePeriod !== undefined && req.body.noticePeriod !== rec.noticePeriod;

  ['reason', 'resignationDate', 'noticePeriod', 'lastWorkingDate', 'status', 'clearance', 'finalSettlementRef', 'notes'].forEach((k) => {
    if (req.body[k] !== undefined) rec[k] = req.body[k];
  });

  // If resignation date or notice period changed, recalculate and validate last working date
  if (resignationDateChanged || noticePeriodChanged) {
    const validation = validateLastWorkingDay(rec.resignationDate, rec.noticePeriod, rec.lastWorkingDate);
    if (!validation.valid) {
      // Auto-correct to expected value
      rec.lastWorkingDate = validation.expected;
      logAudit(req, {
        action: 'offboarding.lastWorkingDate_corrected',
        targetType: 'Offboarding',
        targetId: rec._id,
        description: `Last working date auto-corrected from ${rec.lastWorkingDate} to ${validation.expected} based on resignation date ${rec.resignationDate} and notice period ${rec.noticePeriod}`
      });
    }
  }

  const wasCompleted = rec.status === 'Completed';
  const becomingCompleted = req.body.status === 'Completed' && !wasCompleted;

  ['reason', 'resignationDate', 'noticePeriod', 'lastWorkingDate', 'status', 'clearance', 'finalSettlementRef', 'notes'].forEach((k) => {
    if (req.body[k] !== undefined) rec[k] = req.body[k];
  });

  // If resignation date or notice period changed, recalculate and validate last working date
  if (resignationDateChanged || noticePeriodChanged) {
    const validation = validateLastWorkingDay(rec.resignationDate, rec.noticePeriod, rec.lastWorkingDate);
    if (!validation.valid) {
      // Auto-correct to expected value
      rec.lastWorkingDate = validation.expected;
      logAudit(req, {
        action: 'offboarding.lastWorkingDate_corrected',
        targetType: 'Offboarding',
        targetId: rec._id,
        description: `Last working date auto-corrected from ${rec.lastWorkingDate} to ${validation.expected} based on resignation date ${rec.resignationDate} and notice period ${rec.noticePeriod}`,
      });
    }
  }

  if (becomingCompleted) {
    /* Use the service for atomic completion: reassign tasks/todos/tickets,
       deactivate employee+user, revoke tokens, notify — all in a transaction. */
    const result = await completeOffboarding(rec._id, req.user, req);
    res.json({ offboarding: result.offboarding, reassigned: result.reassigned });
    return;
  }

  await rec.save();
  res.json({ offboarding: rec });
});
