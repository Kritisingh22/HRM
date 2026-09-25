/* Analytics — real aggregates from the database. Requires analytics:read.
 * Managers get TEAM-scoped figures across EVERY aggregate (headcount, leave,
 * payroll, performance, projects, hiring); HR/Admin/Super get company-wide.
 * Team scoping goes through the shared teamScope helper so it cannot drift
 * from the employees/reports controllers (fixes the M1 leak). */
const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');
const Hiring = require('../models/Hiring');
const Performance = require('../models/Performance');
const Project = require('../models/Project');
const catchAsync = require('../utils/catchAsync');
const { teamEmployees } = require('../utils/teamScope');

exports.overview = catchAsync(async (req, res) => {
  const managerScoped = req.user.role === 'MANAGER';

  // Build match filters. For HR/Admin/Super these stay empty → company-wide
  // (identical to the previous behaviour). For a MANAGER every related
  // aggregate is constrained to the manager's own team.
  let empMatch = {};                     // Employee collection
  let byEmp = {};                        // Leave / Payroll / Performance ({employee: {$in}})
  let projMatch = {};                    // Project (manager or member on the team)
  let hiringMatch = { status: 'Open' };  // Hiring (scoped by team departments)

  if (managerScoped) {
    const team = await teamEmployees(req.user);
    const ids = team.map((e) => e._id);
    const depts = [...new Set(team.map((e) => e.department).filter(Boolean))];
    empMatch = { _id: { $in: ids } };
    byEmp = { employee: { $in: ids } };
    projMatch = { $or: [{ manager: { $in: ids } }, { members: { $in: ids } }] };
    hiringMatch = { status: 'Open', department: { $in: depts } };
  }

  // Headcount reflects CURRENT staff only — exited employees are not counted as
  // active. Their leave/payroll/performance HISTORY (the aggregates below, keyed
  // by employee _id) is intentionally left intact so nothing is lost.
  const activeEmpMatch = { ...empMatch, status: { $ne: 'Exited' } };

  const [headcount, deptAgg, leaveAgg, payrollAgg, openJobs, perfAgg, projAgg] = await Promise.all([
    Employee.countDocuments(activeEmpMatch),
    Employee.aggregate([{ $match: activeEmpMatch }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Leave.aggregate([{ $match: byEmp }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Payroll.aggregate([{ $match: byEmp }, { $group: { _id: '$status', net: { $sum: '$net' }, count: { $sum: 1 } } }]),
    Hiring.countDocuments(hiringMatch),
    Performance.aggregate([{ $match: byEmp }, { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }]),
    Project.aggregate([{ $match: projMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);

  res.json({
    scope: managerScoped ? 'team' : 'company',
    generatedBy: req.user.fullName,
    headcount,
    headcountByDepartment: deptAgg.map((d) => ({ department: d._id || 'Unassigned', count: d.count })),
    leaveByStatus: leaveAgg.map((l) => ({ status: l._id, count: l.count })),
    payrollByStatus: payrollAgg.map((p) => ({ status: p._id, net: p.net, count: p.count })),
    openPositions: openJobs,
    performance: perfAgg[0] ? { avgRating: Number((perfAgg[0].avgRating || 0).toFixed(2)), reviews: perfAgg[0].count } : { avgRating: null, reviews: 0 },
    projectsByStatus: projAgg.map((p) => ({ status: p._id, count: p.count }))
  });
});
