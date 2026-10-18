/* TransferTicket API — Manager-initiated employee transfer with multi-step approval.
 * 
 * Permissions:
 * - MANAGER: create tickets for employees they can discover, view own tickets, 
 *   approve/reject when assigned as current/target manager
 * - HR: view/approve/reject when assigned as current/target HR
 * - EMPLOYEE: view own transfer status (read-only)
 * - ADMIN/SUPER_ADMIN: full access
 */
const TransferTicket = require('../models/TransferTicket');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { SEES_ALL, teamEmployeeIds } = require('../utils/teamScope');

/* Helper: Get employee document for the authenticated user */
async function getMyEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

/* Helper: Check if a user is the current or target manager/HR for a ticket */
function getUserRoleInTicket(user, ticket) {
  const userId = String(user._id);
  if (String(ticket.currentManager) === userId) return { role: 'MANAGER', type: 'current' };
  if (String(ticket.targetManager) === userId) return { role: 'MANAGER', type: 'target' };
  if (String(ticket.currentHr) === userId) return { role: 'HR', type: 'current' };
  if (String(ticket.targetHr) === userId) return { role: 'HR', type: 'target' };
  if (String(ticket.requestedBy) === userId) return { role: 'REQUESTER' };
  return null;
}

/* Helper: Build approval steps based on ticket participants */
function buildApprovalSteps(ticket) {
  const steps = [];
  const currentManagerId = String(ticket.currentManager);
  const currentHrId = String(ticket.currentHr);
  const targetManagerId = String(ticket.targetManager);
  const targetHrId = String(ticket.targetHr);

  // Step 1: Current Manager
  steps.push({
    step: 'Pending Current Manager Approval',
    approverRole: 'MANAGER',
    approverType: 'current',
    assignedTo: ticket.currentManager,
    isSkipped: false,
  });

  // Step 2: Current HR
  steps.push({
    step: 'Pending Current HR Approval',
    approverRole: 'HR',
    approverType: 'current',
    assignedTo: ticket.currentHr,
    isSkipped: currentHrId === targetHrId, // skip if same HR
  });

  // Step 3: Target HR (skipped if same as current HR)
  steps.push({
    step: 'Pending Target HR Approval',
    approverRole: 'HR',
    approverType: 'target',
    assignedTo: ticket.targetHr,
    isSkipped: currentHrId === targetHrId,
  });

  // Step 4: Target Manager (skipped if same as current Manager)
  steps.push({
    step: 'Pending Target Manager Approval',
    approverRole: 'MANAGER',
    approverType: 'target',
    assignedTo: ticket.targetManager,
    isSkipped: currentManagerId === targetManagerId,
  });

  return steps;
}

/* Helper: Determine next pending step */
function getNextPendingStep(ticket) {
  for (const step of ticket.approvalSteps) {
    if (step.isSkipped) continue;
    if (!step.decidedBy) return step;
  }
  return null;
}

/* Helper: Check if all required approvals are complete */
function allApprovalsComplete(ticket) {
  for (const step of ticket.approvalSteps) {
    if (step.isSkipped) continue;
    if (!step.decidedBy || step.decision !== 'Approved') return false;
  }
  return true;
}

/* Helper: Add history entry */
function addHistory(ticket, action, performedBy, performedByRole, details, fromStatus, toStatus) {
  ticket.history.push({
    action,
    performedBy,
    performedByRole,
    details,
    fromStatus,
    toStatus,
    timestamp: new Date(),
  });
}

/* Helper: Notify stakeholders */
async function notifyStakeholders(ticket, action, actor, extraMessage = '') {
  try {
    const notifications = [];
    const emp = await Employee.findById(ticket.employee).populate('user').lean();
    if (!emp) return;

    const employeeName = emp.fullName;
    const employeeId = emp.employeeId;

    // Notify employee
    if (emp.user) {
      notifications.push({
        user: emp.user._id,
        type: 'Transfer Request Update',
        title: `Transfer Request ${action} — ${employeeName}`,
        message: `Your transfer request (${ticket.ticketNumber}) has been ${action.toLowerCase()}. ${extraMessage}`,
        relatedEntity: { type: 'TransferTicket', id: ticket._id },
        channels: { inApp: true, email: false },
        priority: 'High',
        metadata: { ticketId: ticket._id, action },
      });
    }

    // Notify current manager
    if (ticket.currentManager && String(ticket.currentManager) !== String(actor._id)) {
      notifications.push({
        user: ticket.currentManager,
        type: 'Transfer Request Update',
        title: `Team Member Transfer ${action}`,
        message: `${employeeName} (${employeeId}) transfer request ${ticket.ticketNumber} has been ${action.toLowerCase()}. ${extraMessage}`,
        relatedEntity: { type: 'TransferTicket', id: ticket._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { ticketId: ticket._id, action, isManagerNotification: true },
      });
    }

    // Notify current HR
    if (ticket.currentHr && String(ticket.currentHr) !== String(actor._id)) {
      notifications.push({
        user: ticket.currentHr,
        type: 'Transfer Request Update',
        title: `Employee Transfer ${action}`,
        message: `${employeeName} (${employeeId}) transfer request ${ticket.ticketNumber} has been ${action.toLowerCase()}. ${extraMessage}`,
        relatedEntity: { type: 'TransferTicket', id: ticket._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { ticketId: ticket._id, action, isHrNotification: true },
      });
    }

    // Notify target manager
    if (ticket.targetManager && String(ticket.targetManager) !== String(actor._id)) {
      notifications.push({
        user: ticket.targetManager,
        type: 'Transfer Request Update',
        title: `Incoming Team Member Transfer ${action}`,
        message: `${employeeName} (${employeeId}) transfer request ${ticket.ticketNumber} has been ${action.toLowerCase()}. ${extraMessage}`,
        relatedEntity: { type: 'TransferTicket', id: ticket._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { ticketId: ticket._id, action, isManagerNotification: true },
      });
    }

    // Notify target HR
    if (ticket.targetHr && String(ticket.targetHr) !== String(actor._id)) {
      notifications.push({
        user: ticket.targetHr,
        type: 'Transfer Request Update',
        title: `Incoming Employee Transfer ${action}`,
        message: `${employeeName} (${employeeId}) transfer request ${ticket.ticketNumber} has been ${action.toLowerCase()}. ${extraMessage}`,
        relatedEntity: { type: 'TransferTicket', id: ticket._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { ticketId: ticket._id, action, isHrNotification: true },
      });
    }

    // Notify requester
    if (ticket.requestedBy && String(ticket.requestedBy) !== String(actor._id)) {
      notifications.push({
        user: ticket.requestedBy,
        type: 'Transfer Request Update',
        title: `Your Transfer Request ${action}`,
        message: `Transfer request ${ticket.ticketNumber} for ${employeeName} has been ${action.toLowerCase()}. ${extraMessage}`,
        relatedEntity: { type: 'TransferTicket', id: ticket._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { ticketId: ticket._id, action },
      });
    }

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('[TransferTicket] Failed to notify stakeholders:', err.message);
  }
}

/* Helper: Apply transfer to employee record */
async function applyTransferToEmployee(ticket) {
  const emp = await Employee.findById(ticket.employee);
  if (!emp) return;

  const changes = [];
  if (ticket.targetManagerEmployeeId && emp.manager !== ticket.targetManagerEmployeeId) {
    emp.manager = ticket.targetManagerEmployeeId;
    changes.push(`manager→${ticket.targetManagerEmployeeId}`);
  }
  if (ticket.targetHrEmployeeId && emp.assignedHrId !== ticket.targetHrEmployeeId) {
    emp.assignedHrId = ticket.targetHrEmployeeId;
    changes.push(`assignedHrId→${ticket.targetHrEmployeeId}`);
  }

  if (changes.length > 0) {
    await emp.save();
    logAudit({ user: ticket.approvedBy }, {
      action: 'transfer_ticket.implement',
      targetType: 'Employee',
      targetId: emp._id,
      description: `Applied transfer ticket ${ticket.ticketNumber} changes to ${emp.employeeId}: ${changes.join(', ')}`,
    });
  }
}

/* POST /api/transfer-tickets — Manager creates a transfer request */
exports.create = catchAsync(async (req, res) => {
  if (req.user.role !== 'MANAGER' && !SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden('Only Managers can create transfer requests.');
  }

  const {
    employeeId,
    targetManagerId,
    targetHrId,
    reason,
    businessJustification,
    requestedEffectiveDate,
    supportingDocument,
  } = req.body;

  if (!employeeId) throw ApiError.badRequest('Employee ID is required.');
  if (!targetManagerId) throw ApiError.badRequest('Target Manager ID is required.');
  if (!targetHrId) throw ApiError.badRequest('Target HR ID is required.');
  if (!reason) throw ApiError.badRequest('Reason is required.');
  if (!requestedEffectiveDate) throw ApiError.badRequest('Requested effective date is required.');

  // Validate employee exists and get current assignments
  const employee = await Employee.findById(employeeId).populate('user');
  if (!employee) throw ApiError.notFound('Employee not found.');

  // Manager can only request transfer for employees they can discover
  // (not their own team - that would be a direct assignment change)
  const myTeamIds = await teamEmployeeIds(req.user);
  const isOwnEmployee = myTeamIds.some(id => String(id) === String(employee._id));
  
  // Allow requesting any employee that's not already in their team
  // The backend will enforce the approval workflow

  // Get current manager and HR
  const currentManagerEmployeeId = employee.manager;
  const currentHrEmployeeId = employee.assignedHrId;

  if (!currentManagerEmployeeId) throw ApiError.badRequest('Employee has no current manager assigned.');
  if (!currentHrEmployeeId) throw ApiError.badRequest('Employee has no current HR assigned.');

  // Cannot transfer to same manager
  if (currentManagerEmployeeId === targetManagerId) {
    throw ApiError.badRequest('Employee is already assigned to this manager.');
  }

  // Validate target manager exists and is a Manager
  const targetManagerUser = await User.findOne({ employeeId: targetManagerId, role: 'MANAGER', status: 'active' });
  if (!targetManagerUser) throw ApiError.notFound('Target Manager not found or not an active Manager.');

  // Validate target HR exists and is an HR
  const targetHrUser = await User.findOne({ employeeId: targetHrId, role: 'HR', status: 'active' });
  if (!targetHrUser) throw ApiError.notFound('Target HR not found or not an active HR.');

  // Validate current manager exists
  const currentManagerUser = await User.findOne({ employeeId: currentManagerEmployeeId, role: 'MANAGER', status: 'active' });
  if (!currentManagerUser) throw ApiError.notFound('Current Manager not found or not an active Manager.');

  // Validate current HR exists
  const currentHrUser = await User.findOne({ employeeId: currentHrEmployeeId, role: 'HR', status: 'active' });
  if (!currentHrUser) throw ApiError.notFound('Current HR not found or not an active HR.');

  // Create the ticket
  const ticket = await TransferTicket.create({
    employee: employee._id,
    currentManager: currentManagerUser._id,
    currentHr: currentHrUser._id,
    currentManagerEmployeeId,
    currentHrEmployeeId,
    targetManager: targetManagerUser._id,
    targetHr: targetHrUser._id,
    targetManagerEmployeeId: targetManagerId,
    targetHrEmployeeId: targetHrId,
    reason,
    businessJustification,
    requestedEffectiveDate: new Date(requestedEffectiveDate),
    supportingDocument,
    requestedBy: req.user._id,
    requestedByRole: 'MANAGER',
    status: 'Pending Current Manager Approval',
    currentStep: 'Pending Current Manager Approval',
    approvalSteps: [],
  });

  // Build and set approval steps
  ticket.approvalSteps = buildApprovalSteps(ticket);
  await ticket.save();

  // Add history
  addHistory(ticket, 'CREATED', req.user._id, 'MANAGER', 
    `Transfer request created for ${employee.fullName} (${employee.employeeId})`, 
    null, ticket.status);

  // Notify stakeholders
  await notifyStakeholders(ticket, 'Created', req.user, 
    `Pending approval from current manager (${currentManagerUser.fullName}).`);

  logAudit(req, {
    action: 'transfer_ticket.create',
    targetType: 'TransferTicket',
    targetId: ticket._id,
    description: `Created transfer request ${ticket.ticketNumber} for ${employee.employeeId} (${employee.fullName}) from Manager ${currentManagerEmployeeId} to ${targetManagerId}`,
  });

  // Populate for response
  const populated = await TransferTicket.findById(ticket._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId');

  res.status(201).json({ transferTicket: populated });
});

/* GET /api/transfer-tickets — List tickets based on role and scope */
exports.list = catchAsync(async (req, res) => {
  let filter = {};

  if (SEES_ALL.includes(req.user.role)) {
    // Admin sees all
    if (req.query.status) filter.status = req.query.status;
  } else if (req.user.role === 'MANAGER') {
    // Manager sees: tickets they created, tickets where they are current/target manager
    filter.$or = [
      { requestedBy: req.user._id },
      { currentManager: req.user._id },
      { targetManager: req.user._id },
    ];
    if (req.query.status) filter.status = req.query.status;
  } else if (req.user.role === 'HR') {
    // HR sees: tickets where they are current/target HR
    filter.$or = [
      { currentHr: req.user._id },
      { targetHr: req.user._id },
    ];
    if (req.query.status) filter.status = req.query.status;
  } else if (req.user.role === 'EMPLOYEE') {
    // Employee sees only their own transfer tickets
    const me = await getMyEmployee(req.user);
    if (me) {
      filter.employee = me._id;
    } else {
      filter.employee = null; // no results
    }
    if (req.query.status) filter.status = req.query.status;
  } else {
    throw ApiError.forbidden('You do not have permission to view transfer tickets.');
  }

  const tickets = await TransferTicket.find(filter)
    .populate('employee', 'employeeId fullName department designation manager assignedHrId')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId')
    .populate('rejectedBy', 'fullName email employeeId')
    .populate('cancelledBy', 'fullName email employeeId')
    .sort({ createdAt: -1 })
    .limit(500);

  res.json({ count: tickets.length, transferTickets: tickets });
});

/* GET /api/transfer-tickets/:id — Get single ticket with access control */
exports.getOne = catchAsync(async (req, res) => {
  const ticket = await TransferTicket.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation manager assignedHrId user')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId')
    .populate('rejectedBy', 'fullName email employeeId')
    .populate('cancelledBy', 'fullName email employeeId')
    .populate('approvalSteps.assignedTo', 'fullName email employeeId')
    .populate('approvalSteps.decidedBy', 'fullName email employeeId');

  if (!ticket) throw ApiError.notFound('Transfer ticket not found.');

  // Access control
  const userRoleInTicket = getUserRoleInTicket(req.user, ticket);
  const isAdmin = SEES_ALL.includes(req.user.role);
  const me = await getMyEmployee(req.user);
  const isOwner = me && String(ticket.employee._id) === String(me._id);

  if (!isAdmin && !userRoleInTicket && !isOwner) {
    throw ApiError.forbidden('You do not have permission to view this transfer ticket.');
  }

  // For employees, hide internal deliberations
  let responseTicket = ticket.toObject();
  if (req.user.role === 'EMPLOYEE' && isOwner) {
    // Filter history to only show employee-visible entries
    responseTicket.history = responseTicket.history.filter(h => 
      !h.details || !h.details.toLowerCase().includes('internal')
    );
    // Could also filter approval steps to hide confidential notes
  }

  res.json({ transferTicket: responseTicket });
});

/* POST /api/transfer-tickets/:id/approve — Approve current step */
exports.approve = catchAsync(async (req, res) => {
  const ticket = await TransferTicket.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation manager assignedHrId user')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId');

  if (!ticket) throw ApiError.notFound('Transfer ticket not found.');

  // Check if user is the assigned approver for the current step
  const userRoleInTicket = getUserRoleInTicket(req.user, ticket);
  const isAdmin = SEES_ALL.includes(req.user.role);

  if (!isAdmin && !userRoleInTicket) {
    throw ApiError.forbidden('You are not authorized to approve this ticket.');
  }

  // Check ticket status
  if (['Approved', 'Rejected', 'Cancelled', 'Completed'].includes(ticket.status)) {
    throw ApiError.badRequest(`Cannot approve a ticket with status: ${ticket.status}`);
  }

  // Find the current pending step assigned to this user
  let currentStepIndex = -1;
  for (let i = 0; i < ticket.approvalSteps.length; i++) {
    const step = ticket.approvalSteps[i];
    if (step.isSkipped) continue;
    if (!step.decidedBy && String(step.assignedTo) === String(req.user._id)) {
      currentStepIndex = i;
      break;
    }
  }

  if (currentStepIndex === -1) {
    throw ApiError.badRequest('No pending approval step assigned to you, or step already decided.');
  }

  const step = ticket.approvalSteps[currentStepIndex];
  const previousStatus = ticket.status;

  // Update step
  step.decidedBy = req.user._id;
  step.decidedAt = new Date();
  step.decision = 'Approved';
  step.reason = req.body.reason || '';

  // Update ticket status to next step
  const nextStep = getNextPendingStep(ticket);
  if (nextStep) {
    ticket.status = nextStep.step;
    ticket.currentStep = nextStep.step;
  } else {
    // All approvals complete
    ticket.status = 'Approved';
    ticket.currentStep = 'Approved';
    ticket.approvedAt = new Date();
  }

  await ticket.save();

  // Add history
  addHistory(ticket, 'APPROVED_STEP', req.user._id, userRoleInTicket?.role || 'ADMIN',
    `Approved step: ${step.step}`, previousStatus, ticket.status);

  // Notify
  await notifyStakeholders(ticket, `Approved (${step.step})`, req.user);

  // If all approvals complete, auto-complete the transfer
  if (ticket.status === 'Approved') {
    // Apply the transfer to employee record
    await applyTransferToEmployee(ticket);
    
    ticket.status = 'Completed';
    ticket.currentStep = 'Completed';
    ticket.completedAt = new Date();
    await ticket.save();

    addHistory(ticket, 'COMPLETED', req.user._id, userRoleInTicket?.role || 'ADMIN',
      'All approvals complete, transfer applied to employee record', 'Approved', 'Completed');

    await notifyStakeholders(ticket, 'Completed', req.user, 
      'The employee has been transferred to the new manager and HR.');
  }

  const populated = await TransferTicket.findById(ticket._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId')
    .populate('approvalSteps.assignedTo', 'fullName email employeeId')
    .populate('approvalSteps.decidedBy', 'fullName email employeeId');

  res.json({ transferTicket: populated });
});

/* POST /api/transfer-tickets/:id/reject — Reject current step */
exports.reject = catchAsync(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('Rejection reason is required.');
  }

  const ticket = await TransferTicket.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation manager assignedHrId user')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId');

  if (!ticket) throw ApiError.notFound('Transfer ticket not found.');

  // Check if user is the assigned approver for the current step
  const userRoleInTicket = getUserRoleInTicket(req.user, ticket);
  const isAdmin = SEES_ALL.includes(req.user.role);

  if (!isAdmin && !userRoleInTicket) {
    throw ApiError.forbidden('You are not authorized to reject this ticket.');
  }

  // Check ticket status
  if (['Approved', 'Rejected', 'Cancelled', 'Completed'].includes(ticket.status)) {
    throw ApiError.badRequest(`Cannot reject a ticket with status: ${ticket.status}`);
  }

  // Find the current pending step assigned to this user
  let currentStepIndex = -1;
  for (let i = 0; i < ticket.approvalSteps.length; i++) {
    const step = ticket.approvalSteps[i];
    if (step.isSkipped) continue;
    if (!step.decidedBy && String(step.assignedTo) === String(req.user._id)) {
      currentStepIndex = i;
      break;
    }
  }

  if (currentStepIndex === -1) {
    throw ApiError.badRequest('No pending approval step assigned to you, or step already decided.');
  }

  const step = ticket.approvalSteps[currentStepIndex];
  const previousStatus = ticket.status;

  // Update step
  step.decidedBy = req.user._id;
  step.decidedAt = new Date();
  step.decision = 'Rejected';
  step.reason = reason;

  // Update ticket status
  ticket.status = 'Rejected';
  ticket.currentStep = 'Rejected';
  ticket.rejectedAt = new Date();
  ticket.rejectedBy = req.user._id;
  ticket.rejectionReason = reason;

  await ticket.save();

  // Add history
  addHistory(ticket, 'REJECTED', req.user._id, userRoleInTicket?.role || 'ADMIN',
    `Rejected at step: ${step.step}. Reason: ${reason}`, previousStatus, 'Rejected');

  // Notify
  await notifyStakeholders(ticket, 'Rejected', req.user, `Reason: ${reason}`);

  const populated = await TransferTicket.findById(ticket._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId')
    .populate('rejectedBy', 'fullName email employeeId')
    .populate('approvalSteps.assignedTo', 'fullName email employeeId')
    .populate('approvalSteps.decidedBy', 'fullName email employeeId');

  res.json({ transferTicket: populated });
});

/* POST /api/transfer-tickets/:id/cancel — Cancel ticket (requester or admin) */
exports.cancel = catchAsync(async (req, res) => {
  const { reason } = req.body;

  const ticket = await TransferTicket.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId');

  if (!ticket) throw ApiError.notFound('Transfer ticket not found.');

  const isRequester = String(ticket.requestedBy._id) === String(req.user._id);
  const isAdmin = SEES_ALL.includes(req.user.role);

  if (!isRequester && !isAdmin) {
    throw ApiError.forbidden('Only the requester or an admin can cancel this ticket.');
  }

  if (['Approved', 'Rejected', 'Cancelled', 'Completed'].includes(ticket.status)) {
    throw ApiError.badRequest(`Cannot cancel a ticket with status: ${ticket.status}`);
  }

  const previousStatus = ticket.status;
  ticket.status = 'Cancelled';
  ticket.currentStep = 'Cancelled';
  ticket.cancelledAt = new Date();
  ticket.cancelledBy = req.user._id;
  ticket.cancellationReason = reason || 'Cancelled by requester';

  await ticket.save();

  addHistory(ticket, 'CANCELLED', req.user._id, req.user.role,
    `Ticket cancelled. Reason: ${reason || 'No reason provided'}`, previousStatus, 'Cancelled');

  await notifyStakeholders(ticket, 'Cancelled', req.user, `Reason: ${reason || 'No reason provided'}`);

  const populated = await TransferTicket.findById(ticket._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('currentManager', 'fullName email employeeId')
    .populate('currentHr', 'fullName email employeeId')
    .populate('targetManager', 'fullName email employeeId')
    .populate('targetHr', 'fullName email employeeId')
    .populate('requestedBy', 'fullName email employeeId')
    .populate('cancelledBy', 'fullName email employeeId')
    .populate('approvalSteps.assignedTo', 'fullName email employeeId')
    .populate('approvalSteps.decidedBy', 'fullName email employeeId');

  res.json({ transferTicket: populated });
});

/* GET /api/transfer-tickets/:id/history — Get ticket history */
exports.getHistory = catchAsync(async (req, res) => {
  const ticket = await TransferTicket.findById(req.params.id)
    .populate('history.performedBy', 'fullName email role');

  if (!ticket) throw ApiError.notFound('Transfer ticket not found.');

  // Access control (same as getOne)
  const userRoleInTicket = getUserRoleInTicket(req.user, ticket);
  const isAdmin = SEES_ALL.includes(req.user.role);
  const me = await getMyEmployee(req.user);
  const isOwner = me && String(ticket.employee._id) === String(me._id);

  if (!isAdmin && !userRoleInTicket && !isOwner) {
    throw ApiError.forbidden('You do not have permission to view this transfer ticket history.');
  }

  let history = ticket.history;
  if (req.user.role === 'EMPLOYEE' && isOwner) {
    history = history.filter(h => 
      !h.details || !h.details.toLowerCase().includes('internal')
    );
  }

  res.json({ history });
});

/* GET /api/transfer-tickets/discoverable-employees — Employees a manager can request transfer for */
exports.discoverableEmployees = catchAsync(async (req, res) => {
  if (req.user.role !== 'MANAGER' && !SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden('Only Managers can discover employees for transfer.');
  }

  // Get all employees in the system (active) that are NOT in the manager's current team
  const myTeamIds = await teamEmployeeIds(req.user);
  const myTeamIdStrings = myTeamIds.map(id => String(id));

  // Find employees not in my team, with valid current manager and HR
  const employees = await Employee.find({
    _id: { $nin: myTeamIds },
    status: { $in: ['Active', 'Probation', 'On Leave'] },
    manager: { $exists: true, $ne: null },
    assignedHrId: { $exists: true, $ne: null },
  })
    .populate('user', 'fullName email')
    .select('employeeId fullName department designation manager assignedHrId')
    .limit(200);

  // Enrich with current manager and HR names
  const managerEmployeeIds = [...new Set(employees.map(e => e.manager).filter(Boolean))];
  const hrEmployeeIds = [...new Set(employees.map(e => e.assignedHrId).filter(Boolean))];

  const managers = await Employee.find({ employeeId: { $in: managerEmployeeIds } })
    .select('employeeId fullName')
    .lean();
  const hrs = await Employee.find({ employeeId: { $in: hrEmployeeIds } })
    .select('employeeId fullName')
    .lean();

  const managerMap = new Map(managers.map(m => [m.employeeId, m.fullName]));
  const hrMap = new Map(hrs.map(h => [h.employeeId, h.fullName]));

  const result = employees.map(e => ({
    _id: e._id,
    employeeId: e.employeeId,
    fullName: e.fullName,
    department: e.department,
    designation: e.designation,
    currentManager: e.manager,
    currentManagerName: managerMap.get(e.manager) || 'Unknown',
    currentHr: e.assignedHrId,
    currentHrName: hrMap.get(e.assignedHrId) || 'Unknown',
  }));

  res.json({ count: result.length, employees: result });
});

/* GET /api/transfer-tickets/available-targets — Get available target managers and HRs */
exports.availableTargets = catchAsync(async (req, res) => {
  if (req.user.role !== 'MANAGER' && !SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden('Only Managers can view transfer targets.');
  }

  // Get all active Managers and HRs except the requester
  const [managers, hrs] = await Promise.all([
    User.find({ role: 'MANAGER', status: 'active', _id: { $ne: req.user._id } })
      .populate('employeeId', 'employeeId')
      .select('fullName email employeeId')
      .lean(),
    User.find({ role: 'HR', status: 'active' })
      .populate('employeeId', 'employeeId')
      .select('fullName email employeeId')
      .lean(),
  ]);

  res.json({
    managers: managers.map(m => ({
      _id: m._id,
      employeeId: m.employeeId,
      fullName: m.fullName,
      email: m.email,
    })),
    hrs: hrs.map(h => ({
      _id: h._id,
      employeeId: h.employeeId,
      fullName: h.fullName,
      email: h.email,
    })),
  });
});