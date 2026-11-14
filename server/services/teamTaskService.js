/* ============================================================
   Team Task Service — cross-collection business logic.

   On teamtask create/assign/status-change/due-date-change:
   • Notify assignee(s) and manager.
   • Recompute parent project progress from task aggregation.
   ============================================================ */

const TeamTask = require('../models/TeamTask');
const Project = require('../models/Project');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { createBulkNotifications, createNotification } = require('./notificationService');
const { logAudit } = require('../utils/audit');

/**
 * Recompute a project's progress from its linked TeamTasks.
 * Progress = average of task completion (Completed=100, else 0) weighted equally.
 * Only recomputes if project is linked to teamtasks.
 * @param {mongoose.Types.ObjectId} projectId
 * @param {Object} [session]
 * @returns {Promise<{progress: number} | null>}
 */
async function recomputeProjectProgress(projectId, session) {
  if (!projectId) return null;

  const opts = session ? { session } : {};
  const tasks = await TeamTask.find({ project: projectId, deletedAt: { $exists: false } }).session(session ? session : null);
  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.status === 'Completed').length;
  const progress = Math.round((completed / tasks.length) * 100);

  await Project.findByIdAndUpdate(projectId, { progress }, opts);
  return { progress };
}

/**
 * Notify assignees and the task creator/manager about a task change.
 * @param {Object} task - the TeamTask document
 * @param {string} changeType - 'created' | 'assigned' | 'status_changed' | 'due_date_changed'
 * @param {Object} actor - the user making the change
 * @param {Object} [changes] - { field, oldValue, newValue }
 * @param {Object} [session]
 */
async function notifyTaskChange(task, changeType, actor, changes, session) {
  const opts = session ? { session } : {};
  const notifs = [];

  /* Resolve assignee users. */
  const assignees = await Employee.find({ _id: { $in: task.assignedTo } }).select('user fullName employeeId').session(session ? session : null);
  const assigneeUserIds = assignees.filter((a) => a.user).map((a) => a.user);

  /* Resolve creator user. */
  let creatorUser = null;
  if (task.createdBy) {
    creatorUser = await User.findById(task.createdBy).session(session ? session : null);
  }

  const changeDesc = changes ? ` (${changes.field}: ${changes.oldValue} → ${changes.newValue})` : '';

  /* Notify assignees. */
  for (const userId of assigneeUserIds) {
    if (String(userId) === String(actor._id)) continue; /* don't notify self */
    const titleMap = {
      created: `New Task Assigned: ${task.title}`,
      assigned: `Task Assigned: ${task.title}`,
      status_changed: `Task Status Updated: ${task.title}`,
      due_date_changed: `Task Due Date Changed: ${task.title}`,
    };
    notifs.push({
      user: userId,
      type: 'task.' + changeType,
      title: titleMap[changeType] || `Task Updated: ${task.title}`,
      message: `${task.title}${changeDesc}. ${changeType.replace('_', ' ')}.`,
      relatedEntity: { type: 'TeamTask', id: task._id },
      channels: { inApp: true, email: false },
      priority: changeType === 'due_date_changed' ? 'High' : 'Normal',
      metadata: { taskId: task._id, changeType },
      session,
    });
  }

  /* Notify creator if different from actor. */
  if (creatorUser && String(creatorUser._id) !== String(actor._id)) {
    notifs.push({
      user: creatorUser._id,
      type: 'task.' + changeType,
      title: `Task ${changeType.replace('_', ' ')}: ${task.title}`,
      message: `${task.title}${changeDesc}.`,
      relatedEntity: { type: 'TeamTask', id: task._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
      metadata: { taskId: task._id, changeType },
      session,
    });
  }

  if (notifs.length) await createBulkNotifications(notifs, session);
}

/**
 * Handle a teamtask status change: record history, notify, recompute project.
 * @param {Object} task - the TeamTask document
 * @param {string} newStatus
 * @param {Object} actor
 * @param {string} reason
 * @param {Object} [session]
 */
async function handleTaskStatusChange(task, newStatus, actor, reason, session) {
  const oldStatus = task.status;
  if (oldStatus === newStatus) return;

  task.addHistory('status_changed', actor._id, {
    field: 'status',
    oldValue: oldStatus,
    newValue: newStatus,
    details: reason || '',
  });

  await notifyTaskChange(task, 'status_changed', actor, { field: 'status', oldValue: oldStatus, newValue: newStatus }, session);

  if (task.project) {
    await recomputeProjectProgress(task.project, session);
  }
}

module.exports = { recomputeProjectProgress, notifyTaskChange, handleTaskStatusChange };
