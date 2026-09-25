/* Helpdesk API. Anyone may raise a ticket and see their own; support staff
 * (helpdesk:manage — HR/Admin/Manager) see all and can assign/resolve. */
const Ticket = require('../models/Ticket');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { hasPermission } = require('../utils/permissions');

exports.list = catchAsync(async (req, res) => {
  const canManage = hasPermission(req.user.role, 'helpdesk:manage');
  const filter = canManage ? {} : { raisedBy: req.user._id };
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

  if (req.body.comment) ticket.comments.push({ by: req.user._id, text: req.body.comment });
  if (req.body.status !== undefined) {
    const ownerMayClose = isOwner && ['Closed'].includes(req.body.status);
    if (!canManage && !ownerMayClose) throw ApiError.forbidden('Only support staff can change ticket status.');
    ticket.status = req.body.status;
  }
  if (req.body.assignedTo !== undefined) { if (!canManage) throw ApiError.forbidden('Only support staff can assign tickets.'); ticket.assignedTo = req.body.assignedTo; }
  if (req.body.priority !== undefined && canManage) ticket.priority = req.body.priority;
  await ticket.save();
  res.json({ ticket });
});
