/* Dashboard summaries — ONE small, role-shaped payload per workspace so a page
 * only fetches what it shows. Identity and scope come from req.user:
 *   EMPLOYEE        → only their own records
 *   HR              → employees assigned to them (teamScope) + their own
 *   MANAGER         → their team (direct reports) + the HR users who report to them
 *   ADMIN/SUPER     → company-wide
 * Nothing here reads an employee id from the request. */
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');
const Project = require('../models/Project');
const Performance = require('../models/Performance');
const Ticket = require('../models/Ticket');
const Todo = require('../models/Todo');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { SEES_ALL, teamEmployeeIds } = require('../utils/teamScope');

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const monthStart = () => day().slice(0, 8) + '01';

async function employeeSummary(user) {
  const emp = await Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }).select('_id');
  if (!emp) return { linked: false };
  const e = emp._id;
  const [attMonth, attToday, leaves, latestPay, projects, perf, todoOpen, todoDone, tickets] = await Promise.all([
    Attendance.find({ employee: e, date: { $gte: monthStart(), $lte: day() } }).select('status'),
    Attendance.findOne({ employee: e, date: day() }).select('status checkIn checkOut'),
    Leave.aggregate([{ $match: { employee: e } }, { $group: { _id: '$status', n: { $sum: 1 }, days: { $sum: '$days' } } }]),
    Payroll.findOne({ employee: e }).sort({ period: -1 }).select('period net status'),
    Project.find({ members: e }).select('status progress'),
    Performance.findOne({ employee: e }).sort({ createdAt: -1 }).select('cycle rating status'),
    Todo.countDocuments({ employee: e, date: day(), status: 'Pending' }),
    Todo.countDocuments({ employee: e, date: day(), status: 'Completed' }),
    Ticket.countDocuments({ raisedBy: user._id, status: { $in: ['Open', 'In Progress'] } }),
  ]);
  const L = Object.fromEntries(leaves.map((x) => [x._id, x]));
  return {
    linked: true,
    attendance: {
      presentDays: attMonth.filter((a) => ['present', 'wfh', 'halfday'].includes(a.status)).length,
      recordedDays: attMonth.length,
      today: attToday ? { status: attToday.status, checkIn: attToday.checkIn, checkOut: attToday.checkOut } : null,
    },
    leave: {
      pending: (L.Pending || {}).n || 0,
      approved: (L.Approved || {}).n || 0,
      rejected: (L.Rejected || {}).n || 0,
      daysTaken: (L.Approved || {}).days || 0,
    },
    payroll: latestPay ? { period: latestPay.period, net: latestPay.net, status: latestPay.status } : null,
    projects: { total: projects.length, active: projects.filter((p) => p.status === 'Active').length },
    performance: perf ? { cycle: perf.cycle, rating: perf.rating, status: perf.status } : null,
    todos: { pendingToday: todoOpen, completedToday: todoDone },
    helpdesk: { open: tickets },
  };
}

async function staffSummary(user) {
  const ids = await teamEmployeeIds(user);              // already scope-limited per role
  const scoped = { employee: { $in: ids } };
  const [employees, presentToday, onLeave, pendingLeaves, payrollPending, activeProjects, openTickets] = await Promise.all([
    Employee.countDocuments({ _id: { $in: ids }, status: { $ne: 'Exited' } }),
    Attendance.countDocuments({ ...scoped, date: day(), status: { $in: ['present', 'wfh', 'halfday'] } }),
    Employee.countDocuments({ _id: { $in: ids }, status: 'On Leave' }),
    Leave.countDocuments({ ...scoped, status: 'Pending' }),
    Payroll.countDocuments({ ...scoped, status: { $in: ['Draft', 'Approved'] } }),
    Project.countDocuments({ status: 'Active', $or: [{ members: { $in: ids } }, { manager: { $in: ids } }] }),
    Ticket.countDocuments({ status: { $in: ['Open', 'In Progress'] } }),
  ]);
  const out = { employees, presentToday, onLeave, pendingLeaves, payrollPending, activeProjects, openTickets };
  if (user.role === 'MANAGER' || SEES_ALL.includes(user.role)) {
    // HR users that fall inside this manager's reach
    const hrEmp = await Employee.find({ _id: { $in: ids } }).select('user');
    const hrUsers = await User.countDocuments({ _id: { $in: hrEmp.map((x) => x.user).filter(Boolean) }, role: 'HR' });
    out.hrCount = hrUsers;
  }
  return out;
}

/* GET /api/dashboard */
exports.summary = catchAsync(async (req, res) => {
  const role = req.user.role;
  if (role === 'EMPLOYEE') return res.json({ scope: 'self', ...(await employeeSummary(req.user)) });
  if (['HR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.json({ scope: SEES_ALL.includes(role) ? 'company' : role === 'MANAGER' ? 'team' : 'assigned', ...(await staffSummary(req.user)) });
  }
  throw ApiError.forbidden('No dashboard is available for your role.');
});
