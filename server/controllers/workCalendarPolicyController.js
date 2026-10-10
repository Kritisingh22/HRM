'use strict';
const WorkCalendarPolicy = require('../models/WorkCalendarPolicy');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');

exports.getActive = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'calendar:read')) {
    throw ApiError.forbidden('You do not have permission to view calendar policies.');
  }

  const policy = await WorkCalendarPolicy.findOne({ isActive: true }).sort({ effectiveFrom: -1 });
  if (!policy) {
    return res.json({ policy: null });
  }
  res.json({ policy });
});

exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'calendar:read')) {
    throw ApiError.forbidden('You do not have permission to view calendar policies.');
  }

  const policies = await WorkCalendarPolicy.find().sort({ effectiveFrom: -1 });
  res.json({ count: policies.length, policies });
});

exports.getOne = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'calendar:read')) {
    throw ApiError.forbidden('You do not have permission to view this calendar policy.');
  }

  const policy = await WorkCalendarPolicy.findById(req.params.id);
  if (!policy) throw ApiError.notFound('Calendar policy not found.');

  res.json({ policy });
});

exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'calendar:write')) {
    throw ApiError.forbidden('You do not have permission to create calendar policies.');
  }

  const { name, description, oddSaturdaysOff, workingDaysPerWeek, standardHoursPerDay, effectiveFrom, effectiveTo } = req.body;

  if (!name || !effectiveFrom) {
    throw ApiError.badRequest('Name and effectiveFrom are required.');
  }

  // If this is set as active, deactivate all others
  if (req.body.isActive !== false) {
    await WorkCalendarPolicy.updateMany({ isActive: true }, { isActive: false });
  }

  const policy = await WorkCalendarPolicy.create({
    name,
    description,
    oddSaturdaysOff: oddSaturdaysOff !== undefined ? oddSaturdaysOff : true,
    workingDaysPerWeek: workingDaysPerWeek || 5,
    standardHoursPerDay: standardHoursPerDay || 8.0,
    effectiveFrom,
    effectiveTo,
    isActive: req.body.isActive !== false,
  });

  logAudit(req, {
    action: 'calendarPolicy.create',
    targetType: 'WorkCalendarPolicy',
    targetId: policy._id,
    description: `Created calendar policy ${policy.name}`,
  });

  res.status(201).json({ policy });
});

exports.update = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'calendar:write')) {
    throw ApiError.forbidden('You do not have permission to update calendar policies.');
  }

  const policy = await WorkCalendarPolicy.findById(req.params.id);
  if (!policy) throw ApiError.notFound('Calendar policy not found.');

  const { name, description, oddSaturdaysOff, workingDaysPerWeek, standardHoursPerDay, effectiveFrom, effectiveTo, isActive } = req.body;

  if (name !== undefined) policy.name = name;
  if (description !== undefined) policy.description = description;
  if (oddSaturdaysOff !== undefined) policy.oddSaturdaysOff = oddSaturdaysOff;
  if (workingDaysPerWeek !== undefined) policy.workingDaysPerWeek = workingDaysPerWeek;
  if (standardHoursPerDay !== undefined) policy.standardHoursPerDay = standardHoursPerDay;
  if (effectiveFrom !== undefined) policy.effectiveFrom = effectiveFrom;
  if (effectiveTo !== undefined) policy.effectiveTo = effectiveTo;
  if (isActive !== undefined) {
    if (isActive && !policy.isActive) {
      // Deactivate all others
      await WorkCalendarPolicy.updateMany({ isActive: true, _id: { $ne: policy._id } }, { isActive: false });
    }
    policy.isActive = isActive;
  }

  await policy.save();

  logAudit(req, {
    action: 'calendarPolicy.update',
    targetType: 'WorkCalendarPolicy',
    targetId: policy._id,
    description: `Updated calendar policy ${policy.name}`,
  });

  res.json({ policy });
});

exports.delete = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'calendar:write')) {
    throw ApiError.forbidden('You do not have permission to delete calendar policies.');
  }

  const policy = await WorkCalendarPolicy.findById(req.params.id);
  if (!policy) throw ApiError.notFound('Calendar policy not found.');

  await policy.deleteOne();

  logAudit(req, {
    action: 'calendarPolicy.delete',
    targetType: 'WorkCalendarPolicy',
    targetId: policy._id,
    description: `Deleted calendar policy ${policy.name}`,
  });

  res.json({ ok: true, message: 'Calendar policy deleted.' });
});

exports.getCurrentForDate = catchAsync(async (req, res) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();

  const policy = await WorkCalendarPolicy.findOne({
    isActive: true,
    effectiveFrom: { $lte: targetDate },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: targetDate } }],
  }).sort({ effectiveFrom: -1 });

  if (!policy) {
    return res.json({ policy: null, message: 'No active policy found for this date' });
  }

  res.json({ policy });
});