/* Reports API — aggregate counts. Requires reports:read. Managers get figures
 * scoped to their own team across EVERY metric (headcount, on-leave, pending
 * leaves, open positions); HR/Admin/Super get company-wide numbers. Team
 * scoping goes through the shared teamScope helper (fixes the M1 leak where
 * pendingLeaves / openJobs were returned company-wide to managers). */
const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const Hiring = require('../models/Hiring');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { teamEmployees } = require('../utils/teamScope');
const { userHasPermission } = require('../utils/permissions');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];

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
    scope: req.user.role === 'MANAGER' ? 'team' : 'company',
    generatedBy: req.user.fullName,
    metrics: { headcount, onLeaveToday: onLeave, pendingLeaves, openPositions: openJobs },
    headcountByDepartment: byDept.map((d) => ({ department: d._id || 'Unassigned', count: d.count }))
  });
});


/* GET /api/reports/me?from=YYYY-MM-DD&to=YYYY-MM-DD — the caller's OWN work report:
 * attendance, leave, to-do completion, project-task activity and daily reports.
 * Everything is keyed off the session's employee; no id is accepted from the client. */
exports.mine = catchAsync(async (req, res) => {
  const Attendance = require('../models/Attendance');
  const Todo = require('../models/Todo');
  const Project = require('../models/Project');
  const DailyReport = require('../models/DailyReport');
  const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] }).select('_id');
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const today = new Date().toISOString().slice(0, 10);
  const from = isDay(req.query.from) ? req.query.from : today.slice(0, 8) + '01';
  const to = isDay(req.query.to) ? req.query.to : today;
  if (!me) return res.json({ from, to, linked: false });
  const e = me._id;
  const [att, leaves, todos, projects, dailies] = await Promise.all([
    Attendance.find({ employee: e, date: { $gte: from, $lte: to } }).select('status'),
    Leave.find({ employee: e, status: 'Approved', from: { $lte: new Date(to) }, to: { $gte: new Date(from) } }).select('days'),
    Todo.find({ employee: e, date: { $gte: from, $lte: to } }).select('status'),
    Project.find({ 'tasks.assignee': e }).select('name tasks'),
    DailyReport.countDocuments({ employee: e, date: { $gte: new Date(from), $lte: new Date(to + 'T23:59:59Z') }, status: { $in: ['Submitted', 'Reviewed'] } }),
  ]);
  const myTasks = projects.flatMap((p) => p.tasks.filter((t) => String(t.assignee) === String(e)));
  res.json({
    from, to, linked: true,
    attendance: { daysPresent: att.filter((a) => ['present', 'wfh', 'halfday'].includes(a.status)).length, daysAbsent: att.filter((a) => a.status === 'absent').length, recorded: att.length },
    leave: { daysTaken: leaves.reduce((n, l) => n + (l.days || 0), 0), requests: leaves.length },
    todos: { total: todos.length, completed: todos.filter((t) => t.status === 'Completed').length },
    projects: { assignedTasks: myTasks.length, doneTasks: myTasks.filter((t) => t.status === 'Done').length, projects: projects.length },
    dailyReports: { submitted: dailies },
  });
});
