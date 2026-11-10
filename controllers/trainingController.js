'use strict';
const Training = require('../models/Training');
const TrainingAssignment = require('../models/TrainingAssignment');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');

exports.listTrainings = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainings:read')) {
    throw ApiError.forbidden('You do not have permission to view trainings.');
  }

  const { isActive, category } = req.query;
  const filter = {};
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (category) filter.category = category;

  const trainings = await Training.find(filter)
    .populate('creator', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(500);

  res.json({ count: trainings.length, trainings });
});

exports.getTraining = catchAsync(async (req, res) => {
  const training = await Training.findById(req.params.id)
    .populate('creator', 'fullName email');

  if (!training) throw ApiError.notFound('Training not found.');

  if (!userHasPermission(req.user, 'trainings:read')) {
    throw ApiError.forbidden('You do not have permission to view this training.');
  }

  res.json({ training });
});

exports.createTraining = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainings:write')) {
    throw ApiError.forbidden('You do not have permission to create trainings.');
  }

  const { title, description, category, durationHours, isMandatory, validityMonths } = req.body;
  if (!title) throw ApiError.badRequest('Title is required.');

  const training = await Training.create({
    title,
    description,
    category,
    durationHours: durationHours || 0,
    isMandatory: isMandatory || false,
    validityMonths: validityMonths || null,
    createdBy: req.user._id,
  });

  logAudit(req, {
    action: 'training.create',
    targetType: 'Training',
    targetId: training._id,
    description: `Created training ${training.title}`,
  });

  res.status(201).json({ training });
});

exports.updateTraining = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainings:write')) {
    throw ApiError.forbidden('You do not have permission to update trainings.');
  }

  const training = await Training.findById(req.params.id);
  if (!training) throw ApiError.notFound('Training not found.');

  const { title, description, category, durationHours, isMandatory, validityMonths, isActive } = req.body;

  if (req.body.title !== undefined) training.title = req.body.title;
  if (description !== undefined) training.description = description;
  if (category !== undefined) training.category = category;
  if (durationHours !== undefined) training.durationHours = durationHours;
  if (isMandatory !== undefined) training.isMandatory = isMandatory;
  if (validityMonths !== undefined) training.validityMonths = validityMonths;
  if (isActive !== undefined) training.isActive = isActive;

  await training.save();

  logAudit(req, {
    action: 'training.update',
    targetType: 'Training',
    targetId: training._id,
    description: `Updated training ${training.title}`,
  });

  res.json({ training });
});

exports.deleteTraining = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainings:delete')) {
    throw ApiError.forbidden('You do not have permission to delete trainings.');
  }

  const training = await Training.findById(req.params.id);
  if (!training) throw ApiError.notFound('Training not found.');

  // Check if any assignments exist
  const count = await require('../models/TrainingAssignment').countDocuments({ training: training._id });
  if (count > 0) {
    throw ApiError.badRequest('Cannot delete training with existing assignments.');
  }

  await training.deleteOne();

  logAudit(req, {
    action: 'training.delete',
    targetType: 'Training',
    targetId: training._id,
    description: `Deleted training ${training.title}`,
  });

  res.json({ ok: true, message: 'Training deleted.' });
});

// Training Assignments
exports.listAssignments = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainingAssignments:read')) {
    throw ApiError.forbidden('You do not have permission to view training assignments.');
  }

  const { employeeId, trainingId, status } = req.query;
  const filter = {};

  if (employeeId) filter.employee = employeeId;
  if (trainingId) filter.training = trainingId;
  if (status) filter.status = status;

  // Scope by role
  if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    filter.employee = me ? me._id : null;
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  } else if (req.user.role === 'HR') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  } else if (employeeId) {
    filter.employee = employeeId;
  }

  const assignments = await TrainingAssignment.find(filter)
    .populate('employee', 'employeeId fullName department designation')
    .populate('training', 'title category durationHours validityMonths')
    .populate('assignedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(500);

  res.json({ count: assignments.length, assignments });
});

exports.getAssignment = catchAsync(async (req, res) => {
  const assignment = await TrainingAssignment.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation user')
    .populate('training', 'title category durationHours validityMonths isMandatory')
    .populate('assignedBy', 'fullName email');

  if (!assignment) throw ApiError.notFound('Training assignment not found.');

  if (!userHasPermission(req.user, 'trainingAssignments:read')) {
    throw ApiError.forbidden('You do not have permission to view this assignment.');
  }

  // Check if user can access this assignment
  if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    if (String(assignment.employee) !== String(me?._id)) {
      throw ApiError.forbidden('You can only view your own training assignments.');
    }
  } else if (req.user.role === 'MANAGER') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(assignment.employee))) {
      throw ApiError.forbidden('You can only view assignments for your team members.');
    }
  } else if (req.user.role === 'HR') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(assignment.employee))) {
      throw ApiError.forbidden('You can only view assignments for your assigned employees.');
    }
  }

  res.json({ assignment });
});

exports.assignTraining = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainingAssignments:write')) {
    throw ApiError.forbidden('You do not have permission to assign trainings.');
  }

  const { employeeId, trainingId, dueDate } = req.body;
  if (!employeeId || !trainingId || !dueDate) {
    throw ApiError.badRequest('employeeId, trainingId, and dueDate are required.');
  }

  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found.');

  // Check if user can assign to this employee
  if (req.user.role === 'MANAGER') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(employeeId))) {
      throw ApiError.forbidden('You can only assign trainings to your team members.');
    }
  } else if (req.user.role === 'HR') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(employeeId))) {
      throw ApiError.forbidden('You can only assign trainings to your assigned employees.');
    }
  }

  const training = await Training.findById(trainingId);
  if (!training) throw ApiError.notFound('Training not found.');

  // Check for existing assignment
  const existing = await TrainingAssignment.findOne({ employee: employeeId, training: trainingId });
  if (existing) {
    throw ApiError.conflict('This training is already assigned to this employee.');
  }

  const assignment = await TrainingAssignment.create({
    employee: employeeId,
    training: trainingId,
    assignedBy: req.user._id,
    dueDate,
    status: 'NOT_STARTED',
  });

  const populated = await TrainingAssignment.findById(assignment._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('training', 'title category durationHours validityMonths')
    .populate('assignedBy', 'fullName email');

  // Notify employee
  const Notification = require('../models/Notification');
  const employeeDoc = await Employee.findById(employeeId).populate('user');
  if (employeeDoc?.user) {
    await Notification.create({
      user: employeeDoc.user._id,
      type: 'Training Assigned',
      title: `New Training Assigned: ${training.title}`,
      message: `You have been assigned "${training.title}" with due date ${new Date(dueDate).toLocaleDateString('en-IN')}.`,
      relatedEntity: { type: 'TrainingAssignment', id: assignment._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  logAudit(req, {
    action: 'trainingAssignment.create',
    targetType: 'TrainingAssignment',
    targetId: assignment._id,
    description: `Assigned training ${training.title} to ${employee.employeeId}`,
  });

  res.status(201).json({ assignment: populated });
});

exports.updateAssignmentStatus = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'trainingAssignments:write')) {
    throw ApiError.forbidden('You do not have permission to update training assignments.');
  }

  const assignment = await TrainingAssignment.findById(req.params.id)
    .populate('employee', 'employeeId fullName user')
    .populate('training', 'title');

  if (!assignment) throw ApiError.notFound('Training assignment not found.');

  // Check permissions
  if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    if (String(assignment.employee) !== String(me?._id)) {
      throw ApiError.forbidden('You can only update your own training assignments.');
    }
    // Employee can only mark as IN_PROGRESS or COMPLETED
    if (!['IN_PROGRESS', 'COMPLETED'].includes(req.body.status)) {
      throw ApiError.forbidden('You can only mark training as In Progress or Completed.');
    }
  } else if (req.user.role === 'MANAGER') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(assignment.employee))) {
      throw ApiError.forbidden('You can only update assignments for your team members.');
    }
  }

  const { status, certificateFileKey } = req.body;

  if (status) {
    assignment.status = status;
    if (status === 'COMPLETED') assignment.completedAt = new Date();
  }
  if (certificateFileKey) assignment.certificateFileKey = certificateFileKey;

  await assignment.save();

  logAudit(req, {
    action: 'trainingAssignment.update',
    targetType: 'TrainingAssignment',
    targetId: assignment._id,
    description: `Updated training assignment ${assignment.training.title} for ${assignment.employee.employeeId} to ${status}`,
  });

  const populated = await TrainingAssignment.findById(assignment._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('training', 'title category durationHours validityMonths')
    .populate('assignedBy', 'fullName email');

  res.json({ assignment: populated });
});

exports.uploadCertificate = catchAsync(async (req, res) => {
  const { fileKey } = req.body;
  if (!fileKey) throw ApiError.badRequest('fileKey is required.');

  const assignment = await TrainingAssignment.findById(req.params.id);
  if (!assignment) throw ApiError.notFound('Training assignment not found.');

  // Only employee or HR/Manager can upload certificate
  if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    if (String(assignment.employee) !== String(me?._id)) {
      throw ApiError.forbidden('You can only upload certificates for your own assignments.');
    }
  }

  assignment.certificateFileKey = fileKey;
  if (assignment.status === 'NOT_STARTED') assignment.status = 'IN_PROGRESS';
  await assignment.save();

  res.json({ assignment: await TrainingAssignment.findById(assignment._id) });
});