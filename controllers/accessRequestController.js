/* AccessRequest API — an HR who needs to work with an employee assigned to a
 * different HR must request access rather than ever seeing that employee by
 * default (requirements #9-#13). Approval is by the CURRENT assigned HR (or an
 * admin). A transfer request (isTransfer) permanently updates assignedHrId on
 * approval; a normal request grants a time-boxed (or open-ended) exception that
 * utils/teamScope.js honors everywhere automatically. */
const AccessRequest = require('../models/AccessRequest');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const Notification = require('../models/Notification');

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/* POST /api/access-requests — an HR requests access to another HR's employee,
 * or requests a permanent transfer of that employee to themselves. */
exports.create = catchAsync(async (req, res) => {
  if (req.user.role !== 'HR' && !ADMIN_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('Only HR can request employee access.');
  }

  const { employeeId, modules = [], actions = ['read'], reason, durationDays, isTransfer } = req.body;
  if (!employeeId) throw ApiError.badRequest('employeeId is required.');

  const employee = await Employee.findOne({ employeeId });
  if (!employee) throw ApiError.notFound('Employee not found.');
  if (!employee.assignedHrId) throw ApiError.badRequest('This employee has no assigned HR to request access from.');

  if (employee.assignedHrId === req.user.employeeId) {
    throw ApiError.badRequest('This employee is already assigned to you.');
  }

  const accessRequest = await AccessRequest.create({
    requestingHrId: req.user.employeeId,
    currentHrId: employee.assignedHrId,
    employeeId,
    modules,
    actions,
    reason,
    isTransfer: !!isTransfer,
    durationDays: isTransfer ? null : (durationDays || null),
    status: 'Pending',
  });

  // Notify the CURRENT assigned HR only — never every HR (requirement #12/#18).
  const currentHrEmployee = await Employee.findOne({ employeeId: employee.assignedHrId });
  if (currentHrEmployee && currentHrEmployee.user) {
    await Notification.create({
      user: currentHrEmployee.user,
      type: 'HR Access Request',
      title: isTransfer ? `Transfer request for ${employee.fullName}` : `Access request for ${employee.fullName}`,
      message: `${req.user.fullName} requested ${isTransfer ? 'a permanent transfer of' : 'access to'} ${employee.fullName} (${employee.employeeId}).${modules.length ? ' Modules: ' + modules.join(', ') + '.' : ''}${durationDays ? ` Duration: ${durationDays} day(s).` : ''}${reason ? ` Reason: ${reason}` : ''}`,
      relatedEntity: { type: 'Other', id: accessRequest._id },
      priority: 'High',
      channels: { inApp: true, email: false },
      metadata: { accessRequestId: accessRequest._id, employeeId, requestingHrId: req.user.employeeId },
    });
  }

  logAudit(req, {
    action: 'access_request.create',
    targetType: 'AccessRequest',
    targetId: accessRequest._id,
    description: `${req.user.employeeId} requested ${isTransfer ? 'transfer of' : 'access to'} ${employeeId} (currently ${employee.assignedHrId})`,
  });

  res.status(201).json({ accessRequest });
});

/* GET /api/access-requests — requests I made, or requests waiting on my
 * decision. Query: ?box=incoming (default) | outgoing */
exports.list = catchAsync(async (req, res) => {
  let filter;
  if (ADMIN_ROLES.includes(req.user.role)) {
    filter = {};
  } else if (req.user.role === 'HR') {
    filter = req.query.box === 'outgoing'
      ? { requestingHrId: req.user.employeeId }
      : { currentHrId: req.user.employeeId };
  } else {
    throw ApiError.forbidden('Only HR/Admin can view access requests.');
  }
  if (req.query.status) filter.status = req.query.status;

  const requests = await AccessRequest.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ count: requests.length, accessRequests: requests });
});

/* PUT /api/access-requests/:id — approve or reject. Only the CURRENT assigned
 * HR (or an admin) may decide — never the requesting HR themselves. */
exports.decide = catchAsync(async (req, res) => {
  const accessRequest = await AccessRequest.findById(req.params.id);
  if (!accessRequest) throw ApiError.notFound('Access request not found.');
  if (accessRequest.status !== 'Pending') throw ApiError.badRequest('This request has already been decided.');

  const isOwner = req.user.role === 'HR' && req.user.employeeId === accessRequest.currentHrId;
  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('Only the employee\'s current HR (or an admin) can decide this request.');
  }

  const decision = req.body.status; // 'Approved' | 'Rejected'
  if (!['Approved', 'Rejected'].includes(decision)) {
    throw ApiError.badRequest('status must be Approved or Rejected.');
  }

  accessRequest.status = decision;
  accessRequest.decidedBy = req.user._id;
  accessRequest.decidedAt = new Date();
  accessRequest.decisionNote = req.body.decisionNote || '';

  if (decision === 'Approved') {
    if (accessRequest.isTransfer) {
      // Permanent: update the Employee record directly, never only client-side.
      await Employee.updateOne({ employeeId: accessRequest.employeeId }, { assignedHrId: accessRequest.requestingHrId });
    } else if (accessRequest.durationDays) {
      accessRequest.expiresAt = new Date(Date.now() + accessRequest.durationDays * 86400000);
    }
  }
  await accessRequest.save();

  // Notify the requesting HR of the decision.
  const requestingHrEmployee = await Employee.findOne({ employeeId: accessRequest.requestingHrId });
  if (requestingHrEmployee && requestingHrEmployee.user) {
    await Notification.create({
      user: requestingHrEmployee.user,
      type: decision === 'Approved' ? 'Access Request Approved' : 'Access Request Rejected',
      title: `Your request for ${accessRequest.employeeId} was ${decision.toLowerCase()}`,
      message: accessRequest.decisionNote || `Your ${accessRequest.isTransfer ? 'transfer' : 'access'} request for employee ${accessRequest.employeeId} was ${decision.toLowerCase()}.`,
      relatedEntity: { type: 'Other', id: accessRequest._id },
      priority: 'Normal',
      channels: { inApp: true, email: false },
      metadata: { accessRequestId: accessRequest._id },
    });
  }

  logAudit(req, {
    action: 'access_request.decide',
    targetType: 'AccessRequest',
    targetId: accessRequest._id,
    description: `${req.user.employeeId} ${decision.toLowerCase()} access request for ${accessRequest.employeeId}`,
  });

  res.json({ accessRequest });
});

/* PUT /api/access-requests/:id/revoke — the current/original HR (or admin) ends
 * a live temporary grant early. */
exports.revoke = catchAsync(async (req, res) => {
  const accessRequest = await AccessRequest.findById(req.params.id);
  if (!accessRequest) throw ApiError.notFound('Access request not found.');

  const isOwner = req.user.role === 'HR' && req.user.employeeId === accessRequest.currentHrId;
  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  if (!isOwner && !isAdmin) throw ApiError.forbidden('Only the employee\'s current HR (or an admin) can revoke this grant.');
  if (accessRequest.status !== 'Approved') throw ApiError.badRequest('Only an approved grant can be revoked.');

  accessRequest.status = 'Revoked';
  accessRequest.decidedAt = new Date();
  await accessRequest.save();

  logAudit(req, {
    action: 'access_request.revoke',
    targetType: 'AccessRequest',
    targetId: accessRequest._id,
    description: `${req.user.employeeId} revoked access grant for ${accessRequest.employeeId}`,
  });

  res.json({ accessRequest });
});
