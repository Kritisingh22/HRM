/* ============================================================
   Transfer Service — cross-collection business logic for transfers.

   Transfer lifecycle:
   • HR creates a Transfer (Pending).
   • Approval flows through TransferTickets (multi-step: current manager → current HR → target HR → target manager).
   • When all tickets are Approved → transfer is Approved.
   • When implemented → users updated in ONE transaction (department, manager, location),
     history written, notifications sent, refresh tokens revoked if role changes.
   ============================================================ */

const mongoose = require('mongoose');
const Transfer = require('../models/Transfer');
const TransferTicket = require('../models/TransferTicket');
const User = require('../models/User');
const Employee = require('../models/Employee');
const RefreshToken = require('../models/RefreshToken');
const { createBulkNotifications, createNotification } = require('./notificationService');
const { revokeUserTokens } = require('./userService');
const { logAudit } = require('../utils/audit');

const APPROVAL_STEP_ORDER = [
  'Pending Current Manager Approval',
  'Pending Current HR Approval',
  'Pending Target HR Approval',
  'Pending Target Manager Approval',
];

/**
 * Advance a transfer ticket to the next approval step or finalize.
 * Called when an approver acts on a ticket.
 * @param {Object} ticket - the TransferTicket document
 * @param {string} decision - 'Approved' | 'Rejected'
 * @param {Object} actor - the approver user
 * @param {string} reason
 * @param {Object} [session]
 * @returns {Promise<{ticket, transfer, allApproved: boolean}>}
 */
async function advanceTicket(ticket, decision, actor, reason, session) {
  const opts = session ? { session } : {};

  const currentStepIndex = APPROVAL_STEP_ORDER.indexOf(ticket.currentStep);

  if (decision === 'Rejected') {
    ticket.currentStep = 'Rejected';
    ticket.status = 'Rejected';
    ticket.rejectedAt = new Date();
    ticket.rejectedBy = actor._id;
    ticket.rejectionReason = reason;
    ticket.history.push({
      action: 'ticket.rejected',
      performedBy: actor._id,
      performedByRole: actor.role,
      timestamp: new Date(),
      fromStatus: ticket.currentStep,
      toStatus: 'Rejected',
      details: reason || '',
    });
    await ticket.save(opts);

    /* Reject the parent transfer too. */
    const transfer = await Transfer.findOne({ employee: ticket.employee }).session(session ? session : null);
    if (transfer && transfer.status === 'Pending') {
      transfer.status = 'Rejected';
      transfer.approvalNote = reason || '';
      await transfer.save(opts);
    }

    return { ticket, transfer: null, allApproved: false };
  }

  /* Approved - move to next step. */
  const nextStepIndex = currentStepIndex + 1;
  if (nextStepIndex < APPROVAL_STEP_ORDER.length) {
    ticket.currentStep = APPROVAL_STEP_ORDER[nextStepIndex];
    ticket.status = APPROVAL_STEP_ORDER[nextStepIndex];
    const currentStep = ticket.approvalSteps.find((s) => s.step === ticket.currentStep);
    if (currentStep) {
      currentStep.decision = 'Approved';
      currentStep.decidedBy = actor._id;
      currentStep.decidedAt = new Date();
    }
    ticket.history.push({
      action: 'ticket.approved',
      performedBy: actor._id,
      performedByRole: actor.role,
      timestamp: new Date(),
      fromStatus: APPROVAL_STEP_ORDER[currentStepIndex],
      toStatus: APPROVAL_STEP_ORDER[nextStepIndex],
      details: reason || '',
    });
    await ticket.save(opts);
    return { ticket, transfer: null, allApproved: false };
  }

  /* Final step approved → all approved. */
  ticket.currentStep = 'Approved';
  ticket.status = 'Approved';
  ticket.approvedAt = new Date();
  ticket.history.push({
    action: 'ticket.completed',
    performedBy: actor._id,
    performedByRole: actor.role,
    timestamp: new Date(),
    fromStatus: APPROVAL_STEP_ORDER[currentStepIndex],
    toStatus: 'Approved',
    details: reason || '',
  });
  await ticket.save(opts);

  /* Approve the parent transfer. */
  const transfer = await Transfer.findOne({ employee: ticket.employee }).session(session ? session : null);
  if (transfer) {
    transfer.status = 'Approved';
    transfer.approvedBy = actor._id;
    transfer.approvedAt = new Date();
    await transfer.save(opts);
  }

  return { ticket, transfer, allApproved: true };
}

/**
 * Implement an approved transfer: update the employee's User record
 * (department, manager, location) in a single transaction, revoke tokens
 * if role changes, write history, notify everyone involved.
 * @param {string|ObjectId} transferId
 * @param {Object} actor - Express req.user
 * @param {Object} req - Express request
 * @returns {Promise<{transfer, employee, user, tokenRevoked: boolean}>}
 */
async function implementTransfer(transferId, actor, req) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transfer = await Transfer.findById(transferId).session(session);
    if (!transfer) throw new Error('Transfer not found.');
    if (transfer.status !== 'Approved') throw new Error('Transfer is not approved.');
    if (transfer.implementedAt) throw new Error('Transfer already implemented.');

    const employee = await Employee.findById(transfer.employee).session(session);
    if (!employee) throw new Error('Employee not found.');

    const oldValues = {
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      manager: employee.manager,
      reportingManagerId: employee.reportingManagerId,
    };

    const user = employee.user ? await User.findById(employee.user).session(session) : null;

    /* ---- Apply changes in one transaction ---- */
    employee.department = transfer.toDepartment || employee.department;
    employee.designation = transfer.toDesignation || employee.designation;
    employee.location = transfer.toLocation || employee.location;
    employee.manager = transfer.toManager || employee.manager;
    if (transfer.toManager) {
      /* Resolve manager employeeId to an Employee ObjectId for reportingManagerId. */
      const managerEmp = await Employee.findOne({ employeeId: transfer.toManager }).session(session);
      if (managerEmp) employee.reportingManagerId = managerEmp._id;
    }
    await employee.save({ session });

    let roleChanged = false;
    if (user) {
      /* If the transfer involves a designation change that maps to a role, update user role.
         For now, only update if explicitly provided in a future extension. Role change
         detection is based on designation → role mapping; keeping existing behavior
         unless the transfer type is a Role Change. */
      if (transfer.type === 'Role Change' && transfer.toDesignation) {
        const roleMap = { 'HR': 'HR', 'MANAGER': 'MANAGER', 'ADMIN': 'ADMIN', 'SUPER_ADMIN': 'SUPER_ADMIN' };
        const newRole = roleMap[transfer.toDesignation];
        if (newRole && user.role !== newRole) {
          user.role = newRole;
          roleChanged = true;
        }
      }
      await user.save({ session });
    }

    transfer.implementedBy = actor._id;
    transfer.implementedAt = new Date();
    transfer.status = 'Implemented';
    await transfer.save({ session });

    /* ---- Revoke tokens if role changed ---- */
    let tokenRevoked = false;
    if (user && roleChanged) {
      await revokeUserTokens(user._id, 'Transfer: role changed', req);
      tokenRevoked = true;
    }

    await session.commitTransaction();

    /* ---- Notifications (outside transaction - best effort) ---- */
    const notifs = [];
    const changedFields = [];
    if (oldValues.department !== employee.department) changedFields.push(`department: ${oldValues.department} → ${employee.department}`);
    if (oldValues.designation !== employee.designation) changedFields.push(`designation: ${oldValues.designation} → ${employee.designation}`);
    if (oldValues.location !== employee.location) changedFields.push(`location: ${oldValues.location} → ${employee.location}`);
    if (oldValues.manager !== employee.manager) changedFields.push(`manager: ${oldValues.manager} → ${employee.manager}`);

    if (user) {
      notifs.push({
        user: user._id,
        type: 'transfer.implemented',
        title: 'Transfer Implemented',
        message: `Your transfer has been implemented.${changedFields.length ? ' Changes: ' + changedFields.join('; ') : ''}`,
        relatedEntity: { type: 'Transfer', id: transfer._id },
        channels: { inApp: true, email: false },
        priority: 'High',
      });
    }

    /* Notify HR and both managers. */
    const hrUsers = await User.find({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' }).session(session);
    for (const hr of hrUsers) {
      notifs.push({
        user: hr._id,
        type: 'transfer.implemented',
        title: 'Transfer Implemented',
        message: `${employee.fullName} (${employee.employeeId}) transfer implemented: ${changedFields.join('; ') || 'no field changes'}.`,
        relatedEntity: { type: 'Transfer', id: transfer._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
      });
    }
    if (notifs.length) await createBulkNotifications(notifs);

    logAudit(req, {
      action: 'transfer.implement',
      targetType: 'Transfer',
      targetId: transfer._id,
      description: `Implemented transfer for ${employee.fullName} (${employee.employeeId}): ${changedFields.join('; ') || 'no changes'}. Role changed: ${roleChanged}.`,
    });

    return { transfer, employee, user, tokenRevoked };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Auto-complete a transfer when all its tickets are closed.
 * Called from the transfer ticket controller after a ticket state change.
 * @param {string|ObjectId} ticketId
 * @returns {Promise<{completed: boolean}>}
 */
async function autoCompleteTransferIfAllTicketsClosed(ticketId) {
  const ticket = await TransferTicket.findById(ticketId);
  if (!ticket) return { completed: false };

  /* Find the transfer for this employee. */
  const transfer = await Transfer.findOne({ employee: ticket.employee });
  if (!transfer || transfer.status === 'Implemented') return { completed: false };

  /* Check all tickets for this employee. */
  const tickets = await TransferTicket.find({ employee: ticket.employee });
  const allApprovedOrCompleted = tickets.every((t) => t.status === 'Approved' || t.status === 'Completed');

  if (allApprovedOrCompleted && tickets.length > 0) {
    transfer.status = 'Completed';
    await transfer.save();
    return { completed: true };
  }

  return { completed: false };
}

module.exports = { advanceTicket, implementTransfer, autoCompleteTransferIfAllTicketsClosed, APPROVAL_STEP_ORDER };
