/* Payslip Request API — employee self-service for missing/incorrect payslips.
 *   Employee → creates own requests, views own history
 *   HR       → sees requests for assigned employees + their own, can review/resolve
 *   Manager  → sees requests for team members only, can review/approve/forward
 *   Admin    → all requests */
const PayslipRequest = require('../models/PayslipRequest');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');

const HR_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN'];

async function myEmployee(user) {
  return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] });
}

// Scope filter for listing requests based on role
async function scopeFilter(user) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return {};
  if (user.role === 'HR' || user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return { employee: { $in: ids } };
  }
  const me = await myEmployee(user);
  return { employee: me ? me._id : null };
}

// Check if user can read a specific request
async function canReadRequest(user, request) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  if (user.role === 'HR' || user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return ids.some((id) => String(id) === String(request.employee));
  }
  const me = await myEmployee(user);
  return !!me && String(me._id) === String(request.employee);
}

// Check if user can review (approve/reject) a request
async function canReviewRequest(user, request) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  if (!userHasPermission(user, 'payslipRequests:review')) return false;
  if (user.role === 'HR' || user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return ids.some((id) => String(id) === String(request.employee));
  }
  return false;
}

/* GET /api/payslip-requests */
exports.list = catchAsync(async (req, res) => {
  const filter = await scopeFilter(req.user);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;

  const requests = await PayslipRequest.find(filter)
    .populate('employee', 'employeeId fullName department designation')
    .populate('payslip', 'period gross net status')
    .populate('resolvedPayslip', 'period gross net status')
    .populate('requestedBy', 'fullName email')
    .populate('reviewedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(500);

  res.json({ count: requests.length, requests });
});

/* GET /api/payslip-requests/:id */
exports.getOne = catchAsync(async (req, res) => {
  const request = await PayslipRequest.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('payslip', 'period gross net status')
    .populate('resolvedPayslip', 'period gross net status')
    .populate('requestedBy', 'fullName email')
    .populate('reviewedBy', 'fullName email');

  if (!request) throw ApiError.notFound('Payslip request not found.');

  if (!(await canReadRequest(req.user, request))) {
    throw ApiError.forbidden('You do not have permission to view this request.');
  }

  res.json({ request });
});

/* POST /api/payslip-requests — employee raises a request */
exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'payslipRequests:create_own') && !userHasPermission(req.user, 'payslipRequests:create')) {
    throw ApiError.forbidden('You do not have permission to create payslip requests.');
  }

  const { period, payslip, type, reason } = req.body;
  if (!period || !type || !reason) {
    throw ApiError.badRequest('period, type, and reason are required.');
  }

  // Verify the employee belongs to the authenticated user
  const me = await myEmployee(req.user);
  if (!me) throw ApiError.badRequest('No employee record linked to your account.');

  // If payslip ID provided, verify it exists and belongs to the employee
  let payslipRef = null;
  if (payslip) {
    const slip = await Payroll.findById(payslip);
    if (!slip) throw ApiError.badRequest('Referenced payslip not found.');
    if (String(slip.employee) !== String(me._id)) {
      throw ApiError.forbidden('You can only request for your own payslips.');
    }
    payslipRef = slip._id;
  }

  // Prevent duplicate active requests for same period/type
  const existing = await PayslipRequest.findOne({
    employee: me._id,
    period,
    status: { $in: ['Pending', 'Under Review', 'Approved'] },
  });
  if (existing) {
    throw ApiError.badRequest('You already have an active request for this period.');
  }

  const request = await PayslipRequest.create({
    employee: me._id,
    period,
    payslip: payslipRef,
    type,
    reason: reason.trim(),
    requestedBy: req.user._id,
    status: 'Pending',
  });

  // Notify HR/Manager
  await notifyReviewers(request, me);

  logAudit(req, {
    action: 'payslipRequest.create',
    targetType: 'PayslipRequest',
    targetId: request._id,
    description: `Created payslip request for ${me.employeeId} (${me.fullName}) for period ${period}`,
  });

  const populated = await PayslipRequest.findById(request._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('payslip', 'period gross net status')
    .populate('requestedBy', 'fullName email');

  res.status(201).json({ request: populated });
});

/* PUT /api/payslip-requests/:id — review/update request */
exports.update = catchAsync(async (req, res) => {
  const request = await PayslipRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Payslip request not found.');

  const action = req.body.action; // 'review', 'approve', 'reject', 'resolve', 'cancel'
  if (!action) throw ApiError.badRequest('Action is required.');

  if (action === 'cancel') {
    // Only the requester can cancel their own pending request
    const me = await myEmployee(req.user);
    const isOwner = me && String(request.employee) === String(me._id);
    if (!isOwner && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      throw ApiError.forbidden('You can only cancel your own request.');
    }
    if (!['Pending', 'Under Review'].includes(request.status)) {
      throw ApiError.badRequest('Only pending requests can be cancelled.');
    }
    request.status = 'Cancelled';
    await request.save();
    await notifyRequester(request, 'cancelled');
  } else if (action === 'review') {
    // HR/Manager starts reviewing
    if (!(await canReviewRequest(req.user, request))) {
      throw ApiError.forbidden('You do not have permission to review this request.');
    }
    if (request.status !== 'Pending') {
      throw ApiError.badRequest('Only pending requests can be reviewed.');
    }
    request.status = 'Under Review';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    if (req.body.reviewNotes) request.reviewNotes = req.body.reviewNotes.trim();
    await request.save();
    await notifyRequester(request, 'review');
  } else if (action === 'approve') {
    // HR/Manager approves the request (means a new/corrected payslip will be generated)
    if (!(await canReviewRequest(req.user, request))) {
      throw ApiError.forbidden('You do not have permission to approve this request.');
    }
    if (!['Pending', 'Under Review'].includes(request.status)) {
      throw ApiError.badRequest('Only pending/under-review requests can be approved.');
    }
    request.status = 'Approved';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    if (req.body.reviewNotes) request.reviewNotes = req.body.reviewNotes.trim();
    await request.save();
    await notifyRequester(request, 'approve');
    await notifyPayrollTeam(request);
  } else if (action === 'reject') {
    if (!(await canReviewRequest(req.user, request))) {
      throw ApiError.forbidden('You do not have permission to reject this request.');
    }
    if (!['Pending', 'Under Review'].includes(request.status)) {
      throw ApiError.badRequest('Only pending/under-review requests can be rejected.');
    }
    request.status = 'Rejected';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    if (req.body.reviewNotes) request.reviewNotes = req.body.reviewNotes.trim();
    await request.save();
    await notifyRequester(request, 'reject');
  } else if (action === 'resolve') {
    // HR/Manager marks as resolved (payslip has been generated/issued)
    if (!(await canReviewRequest(req.user, request))) {
      throw ApiError.forbidden('You do not have permission to resolve this request.');
    }
    if (request.status !== 'Approved') {
      throw ApiError.badRequest('Only approved requests can be resolved.');
    }
    const { resolvedPayslip } = req.body;
    if (!resolvedPayslip) throw ApiError.badRequest('Resolved payslip reference is required.');
    const slip = await Payroll.findById(resolvedPayslip);
    if (!slip) throw ApiError.badRequest('Resolved payslip not found.');
    if (String(slip.employee) !== String(request.employee)) {
      throw ApiError.badRequest('Resolved payslip must belong to the same employee.');
    }
    request.status = 'Resolved';
    request.resolvedPayslip = resolvedPayslip;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    if (req.body.reviewNotes) request.reviewNotes = req.body.reviewNotes.trim();
    await request.save();
    await notifyRequester(request, 'resolve');
  } else {
    throw ApiError.badRequest('Invalid action.');
  }

  logAudit(req, {
    action: `payslipRequest.${action}`,
    targetType: 'PayslipRequest',
    targetId: request._id,
    description: `${action} payslip request for employee ${request.employee} (period ${request.period})`,
  });

  const populated = await PayslipRequest.findById(request._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('payslip', 'period gross net status')
    .populate('resolvedPayslip', 'period gross net status')
    .populate('requestedBy', 'fullName email')
    .populate('reviewedBy', 'fullName email');

  res.json({ request: populated });
});

/* GET /api/payslip-requests/my — employee's own requests */
exports.myRequests = catchAsync(async (req, res) => {
  const me = await myEmployee(req.user);
  if (!me) return res.json({ count: 0, requests: [] });

  const requests = await PayslipRequest.find({ employee: me._id })
    .populate('payslip', 'period gross net status')
    .populate('resolvedPayslip', 'period gross net status')
    .populate('reviewedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ count: requests.length, requests });
});

// Helpers
async function notifyReviewers(request, employee) {
  try {
    // Notify HR users who can see this employee
    const hrUsers = await User.find({
      role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] },
      status: 'active',
    }).select('_id').lean();

    // Also notify the employee's manager if applicable
    const managerIds = [];
    if (employee.manager) {
      const managerEmp = await Employee.findOne({ employeeId: employee.manager }).select('user').lean();
      if (managerEmp?.user) managerIds.push(managerEmp.user);
    }

    const notifications = [];
    for (const hrUser of hrUsers) {
      const hrIds = await teamEmployeeIds(await User.findById(hrUser._id).select('role employeeId'));
      if (hrIds.some(id => String(id) === String(employee._id))) {
        notifications.push({
          user: hrUser._id,
          type: 'Payslip Request',
          title: `New Payslip Request — ${employee.fullName}`,
          message: `${employee.fullName} (${employee.employeeId}) raised a ${request.type.toLowerCase()} payslip request for ${request.period}.`,
          relatedEntity: { type: 'PayslipRequest', id: request._id },
          channels: { inApp: true, email: false },
          priority: 'Normal',
          metadata: { requestId: request._id, employeeId: employee.employeeId, period: request.period },
        });
      }
    }

    // Manager notification
    for (const mgrId of managerIds) {
      notifications.push({
        user: mgrId,
        type: 'Payslip Request',
        title: `Team Payslip Request — ${employee.fullName}`,
        message: `${employee.fullName} (${employee.employeeId}) raised a ${request.type.toLowerCase()} payslip request for ${request.period}.`,
        relatedEntity: { type: 'PayslipRequest', id: request._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { requestId: request._id, employeeId: employee.employeeId, period: request.period },
      });
    }

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('[PayslipRequest] Failed to notify reviewers:', err.message);
  }
}

async function notifyRequester(request, action) {
  try {
    const employee = await Employee.findById(request.employee).populate('user', '_id').lean();
    if (!employee?.user) return;

    const actionLabels = {
      cancelled: 'cancelled',
      review: 'is under review',
      approve: 'has been approved',
      reject: 'has been rejected',
      resolve: 'has been resolved',
    };

    await Notification.create({
      user: employee.user._id,
      type: 'Payslip Request Update',
      title: `Payslip Request ${actionLabels[action] || 'updated'}`,
      message: `Your ${request.type.toLowerCase()} payslip request for ${request.period} ${actionLabels[action] || 'has been updated'}.`,
      relatedEntity: { type: 'PayslipRequest', id: request._id },
      channels: { inApp: true, email: false },
      priority: action === 'reject' ? 'High' : 'Normal',
      metadata: { requestId: request._id, action },
    });
  } catch (err) {
    console.error('[PayslipRequest] Failed to notify requester:', err.message);
  }
}

async function notifyPayrollTeam(request) {
  try {
    // Notify HR users who can handle payroll for this employee
    const hrUsers = await User.find({
      role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] },
      status: 'active',
    }).select('_id').lean();

    const notifications = [];
    for (const hrUser of hrUsers) {
      const hrIds = await teamEmployeeIds(await User.findById(hrUser._id).select('role employeeId'));
      if (hrIds.some(id => String(id) === String(request.employee))) {
        notifications.push({
          user: hrUser._id,
          type: 'Payslip Request Approved',
          title: `Payslip Request Approved — Generate Payslip`,
          message: `A payslip request for ${request.period} has been approved and needs payroll generation.`,
          relatedEntity: { type: 'PayslipRequest', id: request._id },
          channels: { inApp: true, email: false },
          priority: 'Normal',
          metadata: { requestId: request._id },
        });
      }
    }

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('[PayslipRequest] Failed to notify payroll team:', err.message);
  }
}