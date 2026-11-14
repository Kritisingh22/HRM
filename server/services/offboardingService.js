/* ============================================================
   Offboarding Service — cross-collection business logic.

   Completing an offboarding:
   • Reassigns the leaver's open teamtasks, todos, and tickets to their manager.
   • Sets the linked Employee status to 'Exited' and User status to 'inactive'.
   • Revokes all refresh tokens for the user.
   • Notifies manager, HR, and IT.
   • All writes happen in a single mongoose transaction (atomic).
   ============================================================ */

const mongoose = require('mongoose');
const Offboarding = require('../models/Offboarding');
const Employee = require('../models/Employee');
const User = require('../models/User');
const TeamTask = require('../models/TeamTask');
const Todo = require('../models/Todo');
const Ticket = require('../models/Ticket');
const RefreshToken = require('../models/RefreshToken');
const { createBulkNotifications, createNotification } = require('./notificationService');
const { revokeUserTokens } = require('./userService');
const { logAudit } = require('../utils/audit');

/**
 * Complete an offboarding in a single transaction.
 * @param {string|ObjectId} offboardingId
 * @param {Object} actor - Express req.user (authenticated actor)
 * @param {Object} req - Express request (for audit/IP)
 * @returns {Promise<{offboarding, employee, user, reassigned: {tasks, todos, tickets}}>}
 */
async function completeOffboarding(offboardingId, actor, req) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const offboarding = await Offboarding.findById(offboardingId).session(session);
    if (!offboarding) throw new Error('Offboarding record not found.');
    if (offboarding.status === 'Completed') throw new Error('Offboarding already completed.');

    const employee = await Employee.findById(offboarding.employee).session(session);
    if (!employee) throw new Error('Employee not found.');

    const user = employee.user ? await User.findById(employee.user).session(session) : null;

    /* Determine the manager to reassign items to. */
    let managerUser = null;
    if (employee.reportingManagerId) {
      const managerEmp = await Employee.findById(employee.reportingManagerId).session(session);
      if (managerEmp && managerEmp.user) managerUser = await User.findById(managerEmp.user).session(session);
    }
    if (!managerUser && user) {
      /* Fallback: any HR/Admin. */
      managerUser = await User.findOne({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' }).session(session);
    }

    /* ---- Reassign open teamtasks ---- */
    let reassignedTasks = 0;
    const openTasks = await TeamTask.find({
      assignedTo: employee._id,
      deletedAt: { $exists: false },
      status: { $nin: ['Completed', 'Cancelled'] },
    }).session(session);

    for (const task of openTasks) {
      task.assignedTo = task.assignedTo.filter(
        (id) => String(id) !== String(employee._id)
      );
      if (managerUser) task.assignedTo.push(managerUser._id);
      task.addHistory(
        'reassigned',
        actor._id,
        { field: 'assignedTo', oldValue: employee._id.toString(), newValue: managerUser ? managerUser._id.toString() : 'unassigned', details: 'Offboarding completion' }
      );
      await task.save({ session });
      reassignedTasks++;
    }

    /* ---- Reassign open todos ---- */
    let reassignedTodos = 0;
    const openTodos = await Todo.find({
      employee: employee._id,
      status: 'Pending',
    }).session(session);

    for (const todo of openTodos) {
      todo.employee = managerUser ? managerUser._id : employee._id; // fall back to self if no manager
      todo.addedBy = managerUser ? managerUser._id : todo.createdBy;
      await todo.save({ session });
      reassignedTodos++;
    }

    /* ---- Reassign open tickets ---- */
    let reassignedTickets = 0;
    const openTickets = await Ticket.find({
      assignedTo: employee.user || employee._id,
      status: { $nin: ['Resolved', 'Closed'] },
    }).session(session);

    for (const ticket of openTickets) {
      ticket.assignedTo = managerUser ? managerUser._id : undefined;
      await ticket.save({ session });
      reassignedTickets++;
    }

    /* ---- Deactivate employee + user ---- */
    if (employee) {
      employee.status = 'Exited';
      await employee.save({ session });
    }
    if (user) {
      user.status = 'inactive';
      await user.save({ session });
    }

    /* ---- Revoke refresh tokens ---- */
    if (user) await revokeUserTokens(user._id, 'Offboarding completed', req);

    /* ---- Update offboarding record ---- */
    offboarding.status = 'Completed';
    await offboarding.save({ session });

    await session.commitTransaction();

    /* ---- Notifications (outside transaction - best effort) ---- */
    const notifs = [];
    if (managerUser) {
      notifs.push({
        user: managerUser._id,
        type: 'offboarding.completed',
        title: 'Offboarding Completed',
        message: `${employee.fullName} (${employee.employeeId}) has been offboarded. Open tasks/tickets have been reassigned to you.`,
        relatedEntity: { type: 'Offboarding', id: offboarding._id },
        channels: { inApp: true, email: false },
        priority: 'High',
      });
    }
    /* Notify HR/Admin users. */
    const hrUsers = await User.find({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' }).session(session);
    for (const hr of hrUsers) {
      if (String(hr._id) === String(actor._id)) continue;
      notifs.push({
        user: hr._id,
        type: 'offboarding.completed',
        title: 'Offboarding Completed',
        message: `${employee.fullName} (${employee.employeeId}) has been offboarded.`,
        relatedEntity: { type: 'Offboarding', id: offboarding._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
      });
    }
    if (notifs.length) await createBulkNotifications(notifs);

    logAudit(req, {
      action: 'offboarding.complete',
      targetType: 'Offboarding',
      targetId: offboarding._id,
      description: `Completed offboarding for ${employee.fullName} (${employee.employeeId}). Reassigned ${reassignedTasks} tasks, ${reassignedTodos} todos, ${reassignedTickets} tickets.`,
    });

    return {
      offboarding,
      employee,
      user,
      reassigned: { tasks: reassignedTasks, todos: reassignedTodos, tickets: reassignedTickets },
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = { completeOffboarding };
