'use strict';
const LeaveType = require('../models/LeaveType');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');

exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'leaveTypes:read')) {
    throw ApiError.forbidden('You do not have permission to view leave types.');
  }

  const { isActive } = req.query;
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const leaveTypes = await LeaveType.find(filter).sort({ name: 1 });
  res.json({ count: leaveTypes.length, leaveTypes });
});

exports.getOne = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'leaveTypes:read')) {
    throw ApiError.forbidden('You do not have permission to view this leave type.');
  }

  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found.');

  res.json({ leaveType });
});

exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'leaveTypes:write')) {
    throw ApiError.forbidden('You do not have permission to create leave types.');
  }

  const { name, description, defaultEntitlement } = req.body;
  if (!name) throw ApiError.badRequest('Name is required.');

  const leaveType = await LeaveType.create({
    name,
    description,
    defaultEntitlement: defaultEntitlement || 0,
  });

  logAudit(req, {
    action: 'leaveType.create',
    targetType: 'LeaveType',
    targetId: leaveType._id,
    description: `Created leave type ${leaveType.name}`,
  });

  res.status(201).json({ leaveType });
});

exports.update = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'leaveTypes:write')) {
    throw ApiError.forbidden('You do not have permission to update leave types.');
  }

  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found.');

  const { name, description, defaultEntitlement, isActive } = req.body;

  if (name !== undefined) leaveType.name = name;
  if (description !== undefined) leaveType.description = description;
  if (defaultEntitlement !== undefined) leaveType.defaultEntitlement = defaultEntitlement;
  if (isActive !== undefined) leaveType.isActive = isActive;

  await leaveType.save();

  logAudit(req, {
    action: 'leaveType.update',
    targetType: 'LeaveType',
    targetId: leaveType._id,
    description: `Updated leave type ${leaveType.name}`,
  });

  res.json({ leaveType });
});

exports.delete = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'leaveTypes:delete')) {
    throw ApiError.forbidden('You do not have permission to delete leave types.');
  }

  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw ApiError.notFound('Leave type not found.');

  // Check if any leaves reference this type
  const Leave = require('../models/Leave');
  const count = await Leave.countDocuments({ type: leaveType.name });
  if (count > 0) {
    throw ApiError.badRequest('Cannot delete leave type that is in use by existing leave records.');
  }

  await leaveType.deleteOne();

  logAudit(req, {
    action: 'leaveType.delete',
    targetType: 'LeaveType',
    targetId: leaveType._id,
    description: `Deleted leave type ${leaveType.name}`,
  });

  res.json({ ok: true, message: 'Leave type deleted.' });
});

exports.seedDefaults = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'leaveTypes:write')) {
    throw ApiError.forbidden('You do not have permission to seed leave types.');
  }

  const defaults = [
    { name: 'Sick Leave', description: 'For illness and medical appointments', defaultEntitlement: 12 },
    { name: 'Earned Leave', description: 'Accrued paid leave', defaultEntitlement: 15 },
    { name: 'Unpaid Leave', description: 'Leave without pay', defaultEntitlement: 0 },
  ];

  const created = [];
  for (const lt of defaults) {
    const existing = await LeaveType.findOne({ name: lt.name });
    if (!existing) {
      const created = await LeaveType.create(lt);
      created.push(created);
    }
  }

  res.json({ message: 'Default leave types seeded', count: created.length });
});