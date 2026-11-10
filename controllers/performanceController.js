/* Performance API. Employees see their own reviews; managers their team's;
 * HR/Admin all. Writing requires performance:write (managers scoped to team). */
const Performance = require('../models/Performance');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
async function myEmployee(user) { return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }); }
async function teamIds(user) { const t = await Employee.find({ manager: user.employeeId }).select('_id'); return t.map((e) => e._id); }

exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (SEES_ALL.includes(req.user.role)) { if (req.query.employee) filter.employee = req.query.employee; }
  else if (req.user.role === 'MANAGER') { const ids = await teamIds(req.user); const me = await myEmployee(req.user); if (me) ids.push(me._id); filter.employee = { $in: ids }; }
  else { const me = await myEmployee(req.user); filter.employee = me ? me._id : null; }
  const records = await Performance.find(filter).populate('employee', 'employeeId fullName department').sort({ cycle: -1 }).limit(500);
  res.json({ count: records.length, performance: records });
});

exports.create = catchAsync(async (req, res) => {
  if (!req.body.employee || !req.body.cycle) throw ApiError.badRequest('employee and cycle are required.');
  if (req.user.role === 'MANAGER') {
    const team = (await teamIds(req.user)).map(String);
    if (!team.includes(String(req.body.employee))) throw ApiError.forbidden('You can only review your team.');
  }
  const doc = await Performance.create({
    employee: req.body.employee, cycle: req.body.cycle, goals: req.body.goals || [],
    rating: req.body.rating, managerFeedback: req.body.managerFeedback, reviewedBy: req.user._id,
    status: req.body.status || 'Draft'
  });
  res.status(201).json({ performance: doc });
});

exports.update = catchAsync(async (req, res) => {
  const doc = await Performance.findById(req.params.id).populate('employee', 'manager');
  if (!doc) throw ApiError.notFound('Review not found.');
  if (req.user.role === 'MANAGER' && doc.employee.manager !== req.user.employeeId) throw ApiError.forbidden("You can only edit your team's reviews.");
  ['goals', 'rating', 'managerFeedback', 'status'].forEach((k) => { if (req.body[k] !== undefined) doc[k] = req.body[k]; });
  doc.reviewedBy = req.user._id;
  await doc.save();
  res.json({ performance: doc });
});
