/* TeamTask Controller — API for team task management with calendar views. */
const mongoose = require('mongoose');
const TeamTask = require('../models/TeamTask');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');
const { notifyByEmployee } = require('../utils/notifyByEmployee');

/* Helper: check if user can access a task */
async function canAccessTask(user, task) {
  // Admin/Super Admin can access everything
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  
  // Creator can always access
  if (String(task.createdBy) === String(user._id)) return true;
  
  // Assignee can access
  if (task.assignedTo.some(id => String(id) === String(user.employeeId))) return true;
  
  // HR can access tasks in their scope
  if (user.role === 'HR') {
    const ids = await teamEmployeeIds(user);
    return task.assignedTo.some(id => ids.has(id.toString()));
  }
  
  // Manager can access tasks for their team
  if (user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return task.assignedTo.some(id => ids.has(id.toString()));
  }
  
  return false;
}

/* Helper: check if user can manage (create/update/delete) a task */
async function canManageTask(user, task) {
  // Admin/Super Admin can manage everything
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  
  // Creator can manage
  if (String(task.createdBy) === String(user._id)) return true;
  
  // HR can manage tasks in their scope
  if (user.role === 'HR') {
    const ids = await teamEmployeeIds(user);
    return task.assignedTo.some(id => ids.has(id.toString()));
  }
  
  // Manager can manage tasks for their team
  if (user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return task.assignedTo.some(id => ids.has(id.toString()));
  }
  
  return false;
}

/* Helper: manager cannot change status of their own created task */
async function canChangeTaskStatus(user, task) {
  if (user.role === 'MANAGER' && String(task.createdBy) === String(user._id)) {
    return false;
  }
  return true;
}

/* POST /api/team-tasks — create a new task */
exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'tasks:write')) {
    throw ApiError.forbidden('You do not have permission to create tasks.');
  }

  const {
    title,
    description,
    status = 'To Do',
    priority = 'Medium',
    startDate,
    dueDate,
    assignedTo = [],
    team,
    project,
    tags = [],
    estimatedHours,
  } = req.body;

  if (!title) throw ApiError.badRequest('Title is required.');
  if (!dueDate) throw ApiError.badRequest('Due date is required.');

  // Validate assignedTo employees exist
  if (assignedTo.length > 0) {
    const employees = await Employee.find({ _id: { $in: assignedTo } });
    if (employees.length !== assignedTo.length) {
      throw ApiError.badRequest('One or more assigned employees not found.');
    }
  }

  const task = await TeamTask.create({
    title,
    description,
    status,
    priority,
    startDate,
    dueDate,
    assignedTo,
    team,
    project,
    tags: tags || [],
    estimatedHours,
    createdBy: req.user._id,
  });

  // Add history
  task.addHistory('created', req.user._id, { details: 'Task created' });

  // Notify assignees
  if (assignedTo.length > 0) {
    const assigneeEmployees = await Employee.find({ _id: { $in: task.assignedTo } }).populate('user');
    for (const emp of assigneeEmployees) {
      if (emp.user) {
        await Notification.create({
          user: emp.user._id,
          type: 'Task Assigned',
          title: `New Task: ${task.title}`,
          message: `You have been assigned to "${task.title}" (due ${task.dueDate.toISOString().split('T')[0]})`,
          relatedEntity: { type: 'TeamTask', id: task._id },
          channels: { inApp: true, email: false },
          priority: 'Normal',
          metadata: { taskId: task._id },
        });
      }
    }
  }

  // Notify mentioned users in description (simple @mention parsing)
  const mentions = task.description.match(/@(\w+)/g) || [];
  for (const mention of mentions) {
    const username = mention.slice(1);
    const mentionedUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (mentionedUser && mentionedUser._id.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: mentionedUser._id,
        type: 'Task Mention',
        title: `Mentioned in Task: ${task.title}`,
        message: `You were mentioned in "${task.title}"`,
        relatedEntity: { type: 'TeamTask', id: task._id },
        channels: { inApp: true, email: false },
        priority: 'Normal',
        metadata: { taskId: task._id },
      });
    }
  }

  await task.save();

  logAudit(req, {
    action: 'task.create',
    targetType: 'TeamTask',
    targetId: task._id,
    description: `Created task "${task.title}"`,
  });

  res.status(201).json({ task });
});

/* GET /api/team-tasks — list tasks with filters */
exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'tasks:read')) {
    throw ApiError.forbidden('You do not have permission to view tasks.');
  }

  const { 
    status, 
    priority, 
    assignee, 
    team, 
    project, 
    dueFrom, 
    dueTo,
    page = 1, 
    limit = 50,
    sort = '-createdAt'
  } = req.query;

  let filter = { deletedAt: { $exists: false } };

  // Role-based filtering
  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    // Admin sees all
  } else if (req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else {
    // Employee sees only their own tasks
    filter.assignedTo = req.user.employeeId;
  }

  // Apply filters
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignee) filter.assignedTo = assignee;
  if (team) filter.team = team;
  if (project) filter.project = project;
  if (dueFrom || dueTo) {
    filter.dueDate = {};
    if (dueFrom) filter.dueDate.$gte = new Date(dueFrom);
    if (dueTo) filter.dueDate.$lte = new Date(dueTo);
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [tasks, total] = await Promise.all([
    TeamTask.find(filter)
      .populate('assignedTo', 'employeeId fullName designation')
      .populate('createdBy', 'fullName')
      .populate('project', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limitNum),
    TeamTask.countDocuments(filter),
  ]);

  res.json({ 
    count: tasks.length, 
    total, 
    page: pageNum, 
    pages: Math.ceil(total / limitNum),
    tasks 
  });
});

/* GET /api/team-tasks/calendar — get tasks for calendar view */
exports.calendar = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'tasks:read')) {
    throw ApiError.forbidden('You do not have permission to view tasks.');
  }

  const { month, year } = req.query;
  const yearNum = parseInt(year) || new Date().getFullYear();
  const monthNum = parseInt(month) || (new Date().getMonth() + 1);

  const startOfMonth = new Date(yearNum, monthNum - 1, 1);
  const endOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59);

  let filter = { 
    deletedAt: { $exists: false },
    dueDate: { $gte: startOfMonth, $lte: endOfMonth }
  };

  // Role-based filtering
  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    // Admin sees all
  } else if (req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else {
    filter.assignedTo = req.user.employeeId;
  }

  const tasks = await TeamTask.find(filter)
    .populate('assignedTo', 'employeeId fullName designation')
    .populate('createdBy', 'fullName')
    .sort({ dueDate: 1 });

  // Transform for calendar
  const byDate = {};
  for (const task of tasks) {
    const dateKey = task.dueDate.toISOString().split('T')[0];
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push({
      _id: task._id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo,
      dueDate: task.dueDate,
    });
  }

  res.json({ byDate, month: monthNum, year: yearNum });
});

/* GET /api/team-tasks/:id — get single task */
exports.getOne = catchAsync(async (req, res) => {
  const task = await TeamTask.findById(req.params.id)
    .populate('assignedTo', 'employeeId fullName designation email')
    .populate('createdBy', 'fullName email')
    .populate('project', 'name')
    .populate('history.performedBy', 'fullName');

  if (!task) throw ApiError.notFound('Task not found.');

  if (!await canAccessTask(req.user, task)) {
    throw ApiError.forbidden('You do not have permission to view this task.');
  }

  res.json({ task });
});

/* PUT /api/team-tasks/:id — update task */
exports.update = catchAsync(async (req, res) => {
  const task = await TeamTask.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found.');

  if (!await canManageTask(req.user, task)) {
    throw ApiError.forbidden('You do not have permission to edit this task.');
  }

  const allowedFields = [
    'title', 'description', 'status', 'priority', 
    'startDate', 'dueDate', 'assignedTo', 'team', 
    'project', 'tags', 'estimatedHours', 'actualHours'
  ];

  const changes = {};
  const oldValues = {};
  
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === 'status' && req.body.status !== task.status) {
        if (!(await canChangeTaskStatus(req.user, task))) {
          throw ApiError.forbidden('You cannot change the status of your own created task.');
        }
      }
      oldValues[field] = task[field];
      task[field] = req.body[field];
    }
  }

  if (req.body.assignedTo) {
    const employees = await Employee.find({ _id: { $in: req.body.assignedTo } });
    if (employees.length !== req.body.assignedTo.length) {
      throw ApiError.badRequest('One or more assigned employees not found.');
    }
  }

  // Add history for changes
  for (const field of Object.keys(oldValues)) {
    if (JSON.stringify(oldValues[field]) !== JSON.stringify(task[field])) {
      task.addHistory('updated', req.user._id, {
        field,
        oldValue: JSON.stringify(oldValues[field]),
        newValue: JSON.stringify(task[field]),
        details: `Changed ${field} from "${oldValues[field]}" to "${task[field]}"`
      });
    }
  }

  await task.save();

  // Notify new assignees
  if (req.body.assignedTo) {
    const newAssignees = req.body.assignedTo.filter(id => 
      !task.assignedTo.some(old => old.toString() === id.toString())
    );
    if (newAssignees.length > 0) {
      const assigneeEmployees = await Employee.find({ _id: { $in: newAssignees } }).populate('user');
      for (const emp of assigneeEmployees) {
        if (emp.user) {
          await Notification.create({
            user: emp.user._id,
            type: 'Task Assigned',
            title: `New Task: ${task.title}`,
            message: `You have been assigned to "${task.title}" (due ${task.dueDate.toISOString().split('T')[0]})`,
            relatedEntity: { type: 'TeamTask', id: task._id },
            channels: { inApp: true, email: false },
            priority: 'Normal',
            metadata: { taskId: task._id },
          });
        }
      }
    }
  }

  logAudit(req, {
    action: 'task.update',
    targetType: 'TeamTask',
    targetId: task._id,
    description: `Updated task "${task.title}"`,
  });

  res.json({ task });
});

/* PUT /api/team-tasks/:id/status — update task status */
exports.updateStatus = catchAsync(async (req, res) => {
  const task = await TeamTask.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found.');

  if (!await canManageTask(req.user, task)) {
    throw ApiError.forbidden('You do not have permission to update this task.');
  }

  const { status } = req.body;
  if (!['To Do', 'In Progress', 'In Review', 'Blocked', 'Completed', 'Cancelled'].includes(status)) {
    throw ApiError.badRequest('Invalid status.');
  }
  if (status !== task.status) {
    if (!(await canChangeTaskStatus(req.user, task))) {
      throw ApiError.forbidden('You cannot change the status of your own created task.');
    }
  }

  const oldStatus = task.status;
  task.status = status;
  task.addHistory('status_changed', req.user._id, {
    field: 'status',
    oldValue: oldStatus,
    newValue: status,
    details: `Status changed from "${oldStatus}" to "${status}"`
  });

  if (status === 'Completed') {
    task.completedAt = new Date();
  } else {
    task.completedAt = undefined;
  }

  await task.save();

  logAudit(req, {
    action: 'task.status_change',
    targetType: 'TeamTask',
    targetId: task._id,
    description: `Task "${task.title}" status: ${oldStatus} → ${status}`,
  });

  res.json({ task });
});

/* PUT /api/team-tasks/:id/assign — assign task to employees */
exports.assign = catchAsync(async (req, res) => {
  const task = await TeamTask.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found.');

  if (!await canManageTask(req.user, task)) {
    throw ApiError.forbidden('You do not have permission to assign this task.');
  }

  const { assignedTo } = req.body;
  if (!Array.isArray(assignedTo)) {
    throw ApiError.badRequest('assignedTo must be an array of employee IDs.');
  }

  const employees = await Employee.find({ _id: { $in: assignedTo } });
  if (employees.length !== assignedTo.length) {
    throw ApiError.badRequest('One or more assigned employees not found.');
  }

  const oldAssigned = task.assignedTo.map(id => id.toString());
  task.assignedTo = assignedTo;
  task.addHistory('assigned', req.user._id, {
    field: 'assignedTo',
    oldValue: JSON.stringify(oldAssigned),
    newValue: JSON.stringify(assignedTo),
    details: `Assigned to ${employees.map(e => e.fullName).join(', ')}`
  });

  await task.save();

  // Notify new assignees
  const newAssignees = assignedTo.filter(id => !oldAssigned.includes(id));
  if (newAssignees.length > 0) {
    const assigneeEmployees = await Employee.find({ _id: { $in: newAssignees } }).populate('user');
    for (const emp of assigneeEmployees) {
      if (emp.user) {
        await Notification.create({
          user: emp.user._id,
          type: 'Task Assigned',
          title: `New Task: ${task.title}`,
          message: `You have been assigned to "${task.title}" (due ${task.dueDate.toISOString().split('T')[0]})`,
          relatedEntity: { type: 'TeamTask', id: task._id },
          channels: { inApp: true, email: false },
          priority: 'Normal',
          metadata: { taskId: task._id },
        });
      }
    }
  }

  logAudit(req, {
    action: 'task.assign',
    targetType: 'TeamTask',
    targetId: task._id,
    description: `Assigned task "${task.title}" to ${employees.map(e => e.fullName).join(', ')}`,
  });

  res.json({ task });
});

/* DELETE /api/team-tasks/:id — soft delete task */
exports.remove = catchAsync(async (req, res) => {
  const task = await TeamTask.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found.');

  if (!await canManageTask(req.user, task)) {
    throw ApiError.forbidden('You do not have permission to delete this task.');
  }

  task.deletedAt = new Date();
  task.deletedBy = req.user._id;
  task.addHistory('deleted', req.user._id, { details: 'Task deleted' });
  await task.save();

  logAudit(req, {
    action: 'task.delete',
    targetType: 'TeamTask',
    targetId: task._id,
    description: `Deleted task "${task.title}"`,
  });

  res.json({ ok: true });
});

/* POST /api/team-tasks/:id/remind — send reminder for task */
exports.sendReminder = catchAsync(async (req, res) => {
  const task = await TeamTask.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found.');

  if (!await canManageTask(req.user, task)) {
    throw ApiError.forbidden('You do not have permission to send reminders for this task.');
  }

  const { type = 'deadline_approaching' } = req.body;

  // Get all assignees with user accounts
  const assignees = await Employee.find({ _id: { $in: task.assignedTo } }).populate('user');
  
  for (const emp of assignees) {
    if (emp.user) {
      // Check if reminder already sent recently
      if (!task.hasReminderSent('deadline_approaching', emp.user._id)) {
        await Notification.create({
          user: emp.user._id,
          type: 'Task Reminder',
          title: `Task Reminder: ${task.title}`,
          message: `Reminder: "${task.title}" is due ${task.dueDate.toISOString().split('T')[0]}.`,
          relatedEntity: { type: 'TeamTask', id: task._id },
          channels: { inApp: true, email: false },
          priority: 'High',
          metadata: { taskId: task._id, reminderType: 'deadline_approaching' },
        });
        task.addReminder('deadline_approaching', emp.user._id);
      }
    }
  }

  await task.save();

  logAudit(req, {
    action: 'task.reminder_sent',
    targetType: 'TeamTask',
    targetId: task._id,
    description: `Sent reminder for task "${task.title}"`,
  });

  res.json({ ok: true, message: 'Reminders sent to assignees.' });
});

/* GET /api/team-tasks/overdue — get overdue tasks */
exports.getOverdue = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'tasks:read')) {
    throw ApiError.forbidden('You do not have permission to view tasks.');
  }

  const now = new Date();
  let filter = { 
    deletedAt: { $exists: false },
    status: { $nin: ['Completed', 'Cancelled'] },
    dueDate: { $lt: now }
  };

  // Role-based filtering
  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    // Admin sees all
  } else if (req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else {
    filter.assignedTo = req.user.employeeId;
  }

  const tasks = await TeamTask.find(filter)
    .populate('assignedTo', 'employeeId fullName designation')
    .populate('createdBy', 'fullName')
    .sort({ dueDate: 1 });

  res.json({ count: tasks.length, tasks });
});

/* GET /api/team-tasks/upcoming — get upcoming tasks (due in next 7 days) */
exports.getUpcoming = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'tasks:read')) {
    throw ApiError.forbidden('You do not have permission to view tasks.');
  }

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let filter = { 
    deletedAt: { $exists: false },
    status: { $nin: ['Completed', 'Cancelled'] },
    dueDate: { $gte: now, $lte: nextWeek }
  };

  // Role-based filtering
  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    // Admin sees all
  } else if (req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.assignedTo = { $in: ids };
  } else {
    filter.assignedTo = req.user.employeeId;
  }

  const tasks = await TeamTask.find(filter)
    .populate('assignedTo', 'employeeId fullName designation')
    .populate('createdBy', 'fullName')
    .sort({ dueDate: 1 });

  res.json({ count: tasks.length, tasks });
});