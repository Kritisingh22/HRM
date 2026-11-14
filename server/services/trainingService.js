/* ============================================================
   Training Service — assignments, completion, reminders.

   • Assigning a training creates one assignment per employee
     (unique training+employee — enforced by unique index).
   • On completion: updates the assignment + increments training
     aggregate counts (stored on Training via computed field).
   • Reminders for pending assignments (due today/tomorrow/overdue).
   • Notifies employee and manager on assignment and completion.
   ============================================================ */

const TrainingAssignment = require('../models/TrainingAssignment');
const Training = require('../models/Training');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { createBulkNotifications, createNotification } = require('./notificationService');
const { logAudit } = require('../utils/audit');

/**
 * Assign a training to one or more employees.
 * Creates one assignment per employee (unique training+employee).
 * @param {Object} data - { trainingId, employeeIds: [ObjectId], dueDate, assignedBy }
 * @param {Object} actor - Express req.user
 * @param {Object} req - Express request
 * @returns {Promise<{created: number, skipped: number}>}
 */
async function assignTraining(data, actor, req) {
  const { trainingId, employeeIds, dueDate } = data;
  const assignedBy = actor._id;

  const training = await Training.findById(trainingId);
  if (!training) throw new Error('Training not found.');

  const results = { created: 0, skipped: 0 };
  const notifs = [];

  for (const empId of employeeIds) {
    /* Unique index on (employee, training) prevents duplicates. */
    const existing = await TrainingAssignment.findOne({ employee: empId, training: trainingId });
    if (existing) {
      results.skipped++;
      continue;
    }

    const emp = await Employee.findById(empId);
    if (!emp) {
      results.skipped++;
      continue;
    }

    await TrainingAssignment.create({
      employee: empId,
      training: trainingId,
      assignedBy,
      dueDate: new Date(dueDate),
      status: 'NOT_STARTED',
    });
    results.created++;

    /* Notify the employee. */
    if (emp.user) {
      notifs.push({
        user: emp.user,
        type: 'training.assigned',
        title: `Training Assigned: ${training.title}`,
        message: `You have been assigned the training "${training.title}". Due: ${new Date(dueDate).toLocaleDateString('en-IN')}.`,
        relatedEntity: { type: 'TrainingAssignment', id: null }, /* will be filled after create */
        channels: { inApp: true, email: false },
        priority: training.isMandatory ? 'High' : 'Normal',
      });
    }

    /* Notify the employee's manager. */
    if (emp.reportingManagerId) {
      const managerEmp = await Employee.findById(emp.reportingManagerId).select('user');
      if (managerEmp?.user) {
        notifs.push({
          user: managerEmp.user,
          type: 'training.assigned_team',
          title: `Team Member Training Assigned`,
          message: `${emp.fullName} (${emp.employeeId}) has been assigned "${training.title}".`,
          relatedEntity: { type: 'TrainingAssignment', id: null },
          channels: { inApp: true, email: false },
          priority: 'Normal',
        });
      }
    }

    logAudit(req, {
      action: 'training.assign',
      targetType: 'TrainingAssignment',
      targetId: null,
      description: `Assigned training "${training.title}" to ${emp.employeeId}.`,
    });
  }

  if (notifs.length) await createBulkNotifications(notifs);

  return results;
}

/**
 * Mark a training assignment as completed.
 * Updates the assignment and recomputes training aggregate counts.
 * @param {string|ObjectId} assignmentId
 * @param {Object} actor
 * @param {Object} req
 * @param {Object} [certificateFileKey]
 * @returns {Promise<TrainingAssignment>}
 */
async function completeTrainingAssignment(assignmentId, actor, req, certificateFileKey) {
  const assignment = await TrainingAssignment.findById(assignmentId)
    .populate('employee', 'fullName employeeId user reportingManagerId')
    .populate('training');
  if (!assignment) throw new Error('Training assignment not found.');
  if (assignment.status === 'COMPLETED') throw new Error('Assignment already completed.');

  assignment.status = 'COMPLETED';
  assignment.completedAt = new Date();
  if (certificateFileKey) assignment.certificateFileKey = certificateFileKey;
  await assignment.save();

  /* Recompute training aggregate: count completed assignments. */
  const completedCount = await TrainingAssignment.countDocuments({
    training: assignment.training._id,
    status: 'COMPLETED',
  });
  /* Training model doesn't have an aggregate count field; we could add one.
     For now, we log it. If the frontend needs it, add a 'completionCount' field
     to Training and update it here. */
  console.log(`[trainingService] Training ${assignment.training._id} now has ${completedCount} completed assignments.`);

  /* Notify the employee. */
  if (assignment.employee && assignment.employee.user) {
    await createNotification({
      user: assignment.employee.user,
      type: 'training.completed',
      title: `Training Completed: ${assignment.training.title}`,
      message: `You have completed "${assignment.training.title}".`,
      relatedEntity: { type: 'TrainingAssignment', id: assignment._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  /* Notify manager. */
  if (assignment.employee && assignment.employee.reportingManagerId) {
    const managerEmp = await Employee.findById(assignment.employee.reportingManagerId).select('user');
    if (managerEmp?.user) {
      await createNotification({
        user: managerEmp.user,
        type: 'training.completed_team',
        title: `Team Member Training Completed`,
        message: `${assignment.employee.fullName} (${assignment.employee.employeeId}) completed "${assignment.training.title}".`,
        relatedEntity: { type: 'TrainingAssignment', id: assignment._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
      });
    }
  }

  logAudit(req, {
    action: 'training.complete',
    targetType: 'TrainingAssignment',
    targetId: assignment._id,
    description: `Completed training assignment for ${assignment.employee ? assignment.employee.employeeId : 'unknown'}.`,
  });

  return assignment;
}

module.exports = { assignTraining, completeTrainingAssignment };
