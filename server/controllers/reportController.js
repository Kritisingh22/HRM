/* Reports API — aggregate counts. Requires reports:read. Managers get figures
 * scoped to their own team across EVERY metric (headcount, on-leave, pending
 * leaves, open positions); HR/Admin/Super get company-wide numbers. Team
 * scoping goes through the shared teamScope helper (fixes the M1 leak where
 * pendingLeaves / openJobs were returned company-wide to managers). */
const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const Hiring = require('../models/Hiring');
const catchAsync = require('../utils/catchAsync');
const { teamEmployees } = require('../utils/teamScope');
const { userHasPermission } = require('../utils/permissions');

/* GET /api/reports/summary */
exports.summary = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, 'reports:read')) {
    throw ApiError.forbidden('You do not have permission to view reports.');
  }
  
  const managerScoped = req.user.role === 'MANAGER';

  let empMatch = {};                     // Employee collection
  let byEmp = {};                        // Leave ({employee: {$in}})
  let hiringMatch = { status: 'Open' };  // Hiring (scoped by team departments)

  if (managerScoped) {
    const team = await teamEmployees(req.user);
    const ids = team.map((e) => e._id);
    const depts = [...new Set(team.map((e) => e.department).filter(Boolean))];
    empMatch = { _id: { $in: ids } };
    byEmp = { employee: { $in: ids } };
    hiringMatch = { status: 'Open', department: { $in: depts } };
  }

  // Headcount = current staff only; exited employees are not counted as active.
  const activeEmpMatch = { ...empMatch, status: { $ne: 'Exited' } };

  const [headcount, onLeave, pendingLeaves, openJobs] = await Promise.all([
    Employee.countDocuments(activeEmpMatch),
    Employee.countDocuments({ ...empMatch, status: 'On Leave' }),
    Leave.countDocuments({ ...byEmp, status: 'Pending' }),
    Hiring.countDocuments(hiringMatch)
  ]);

  const byDept = await Employee.aggregate([
    { $match: activeEmpMatch },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.json({
    scope: managerScoped ? 'team' : 'company',
    generatedBy: req.user.fullName,
    metrics: { headcount, onLeaveToday: onLeave, pendingLeaves, openPositions: openJobs },
    headcountByDepartment: byDept.map((d) => ({ department: d._id || 'Unassigned', count: d.count }))
  });
});
