/* Helpdesk API. Anyone may raise a ticket and see their own; support staff
 * (helpdesk:manage — HR/Admin/Manager) see all and can assign/resolve. */
const Ticket = require('../models/Ticket');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { hasPermission } = require('../utils/permissions');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { SEES_ALL, teamEmployeeIds } = require('../utils/teamScope');

// User ids whose tickets this caller may see. null = everyone (admins). HR/Manager
// see their own tickets plus those raised by employees in their scope — NOT everyone's.
async function visibleUserIds(user) {
  if (SEES_ALL.includes(user.role)) return null;
  if (!['HR', 'MANAGER'].includes(user.role)) return [user._id];
  const ids = await teamEmployeeIds(user);
  const emps = await Employee.find({ _id: { $in: ids } }).select('user');
  return [user._id, ...emps.map((e) => e.user).filter(Boolean)];
}

exports.list = catchAsync(async (req, res) => {
  const canManage = hasPermission(req.user.role, 'helpdesk:manage');
  const filter = {};
  const vis = canManage ? await visibleUserIds(req.user) : [req.user._id];
  if (vis) filter.raisedBy = { $in: vis };
  if (req.query.status) filter.status = req.query.status;
  const tickets = await Ticket.find(filter)
    .populate('raisedBy', 'fullName email').populate('assignedTo', 'fullName')
    .sort({ createdAt: -1 }).limit(500);
  res.json({ count: tickets.length, tickets });
});

exports.create = catchAsync(async (req, res) => {
  if (!req.body.subject) throw ApiError.badRequest('subject is required.');
  const ticket = await Ticket.create({
    subject: req.body.subject, description: req.body.description,
    category: req.body.category || 'Other', priority: req.body.priority || 'Medium',
    raisedBy: req.user._id
  });
  res.status(201).json({ ticket });
});

exports.update = catchAsync(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Ticket not found.');
  const canManage = hasPermission(req.user.role, 'helpdesk:manage');
  const isOwner = String(ticket.raisedBy) === String(req.user._id);
  if (!canManage && !isOwner) throw ApiError.forbidden('You can only update your own tickets.');
  if (canManage && !isOwner) {
    const vis = await visibleUserIds(req.user);
    if (vis && !vis.map(String).includes(String(ticket.raisedBy))) throw ApiError.forbidden('This query is not assigned to your scope.');
  }
  const prevStatus = ticket.status;

  if (req.body.comment) ticket.comments.push({ by: req.user._id, text: req.body.comment });
  if (req.body.status !== undefined) {
    const ownerMayClose = isOwner && ['Closed'].includes(req.body.status);
    if (!canManage && !ownerMayClose) throw ApiError.forbidden('Only support staff can change ticket status.');
    ticket.status = req.body.status;
  }
  if (req.body.assignedTo !== undefined) { if (!canManage) throw ApiError.forbidden('Only support staff can assign tickets.'); ticket.assignedTo = req.body.assignedTo; }
  if (req.body.priority !== undefined && canManage) ticket.priority = req.body.priority;
  await ticket.save();
  // tell the employee when support staff respond or change the status
  if (!isOwner && (req.body.comment || ticket.status !== prevStatus)) {
    try {
      await Notification.create({
        user: ticket.raisedBy, type: 'Helpdesk Update', title: 'Helpdesk query updated',
        message: 'Your query "' + ticket.subject + '" is now ' + ticket.status + (req.body.comment ? ' — a response was added.' : '.'),
        relatedEntity: { type: 'Other', id: ticket._id }, priority: 'Normal',
      });
    } catch (e) { console.error('[Helpdesk] notify failed:', e.message); }
  }
  res.json({ ticket });
});
