'use strict';
const SalaryStructure = require('../models/SalaryStructure');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');

async function canManageSalaryStructure(user, employeeId) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  if (user.role === 'HR') {
    // HR can manage salary structures for their assigned employees
    const employee = await Employee.findById(employeeId);
    if (!employee) return false;
    return employee.assignedHrId === user.employeeId || employee.employeeId === user.employeeId;
  }
  return false;
}

exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'salaryStructures:read')) {
    throw ApiError.forbidden('You do not have permission to view salary structures.');
  }

  const { employeeId, isActive } = req.query;
  const filter = {};

  if (employeeId) {
    // Check if user can view this employee's salary structure
    if (!(await canManageSalaryStructure(req.user, employeeId))) {
      throw ApiError.forbidden('You do not have permission to view this salary structure.');
    }
    filter.employee = employeeId;
  } else if (['HR', 'MANAGER'].includes(req.user.role)) {
    // HR sees their assigned employees, Manager sees their team
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  } else {
    // Employee sees only their own
    const Employee = require('../models/Employee');
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    filter.employee = me ? me._id : null;
  }

  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const structures = await SalaryStructure.find(filter)
    .populate('employee', 'employeeId fullName department designation')
    .sort({ effectiveFrom: -1 })
    .limit(500);

  res.json({ count: structures.length, structures });
});

exports.getOne = catchAsync(async (req, res) => {
  const structure = await SalaryStructure.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation');

  if (!structure) throw ApiError.notFound('Salary structure not found.');

  // Check permissions
  if (!await canManageSalaryStructure(req.user, structure.employee._id)) {
    throw ApiError.forbidden('You do not have permission to view this salary structure.');
  }

  res.json({ structure });
});

exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'salaryStructures:write')) {
    throw ApiError.forbidden('You do not have permission to create salary structures.');
  }

  const { employee, basic, hra, allowances, deductions, effectiveFrom, effectiveTo } = req.body;

  if (!employee || !effectiveFrom) {
    throw ApiError.badRequest('employee and effectiveFrom are required.');
  }

  // Check if user can manage this employee's salary
  if (!await canManageSalaryStructure(req.user, employee)) {
    throw ApiError.forbidden('You are not authorized to create salary structure for this employee.');
  }

  // Check for overlapping active structure for the same employee
  const existing = await SalaryStructure.findOne({
    employee,
    isActive: true,
    effectiveFrom: { $lte: effectiveFrom || new Date() },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: new Date(effectiveFrom) } }],
  });

  if (existing) {
    throw ApiError.conflict('An active salary structure already exists for this employee for this period.');
  }

  const structure = await SalaryStructure.create({
    employee,
    basic: basic || 0,
    hra: hra || 0,
    allowances: allowances || {},
    deductions: deductions || {},
    effectiveFrom,
    effectiveTo,
    isActive: true,
  });

  logAudit(req, {
    action: 'salaryStructure.create',
    targetType: 'SalaryStructure',
    targetId: structure._id,
    description: `Created salary structure for employee ${structure.employee.employeeId}`,
  });

  const populated = await SalaryStructure.findById(structure._id).populate('employee', 'employeeId fullName department designation');
  res.status(201).json({ structure: populated });
});

exports.update = catchAsync(async (req, res) => {
  const structure = await SalaryStructure.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation');

  if (!structure) throw ApiError.notFound('Salary structure not found.');

  if (!await canManageSalaryStructure(req.user, structure.employee._id)) {
    throw ApiError.forbidden('You are not authorized to modify this salary structure.');
  }

  const { basic, hra, allowances, deductions, effectiveFrom, effectiveTo, isActive } = req.body;

  if (basic !== undefined) structure.basic = basic;
  if (hra !== undefined) structure.hra = hra;
  if (allowances !== undefined) structure.allowances = allowances || {};
  if (deductions !== undefined) structure.deductions = deductions || {};
  if (effectiveFrom !== undefined) structure.effectiveFrom = effectiveFrom;
  if (effectiveTo !== undefined) structure.effectiveTo = effectiveTo;
  if (isActive !== undefined) structure.isActive = isActive;

  await structure.save();

  logAudit(req, {
    action: 'salaryStructure.update',
    targetType: 'SalaryStructure',
    targetId: structure._id,
    description: `Updated salary structure for ${structure.employee.employeeId}`,
  });

  const populated = await SalaryStructure.findById(structure._id).populate('employee', 'employeeId fullName department designation');
  res.json({ structure: populated });
});

exports.deactivate = catchAsync(async (req, res) => {
  const structure = await SalaryStructure.findById(req.params.id);
  if (!structure) throw ApiError.notFound('Salary structure not found.');

  if (!await canManageSalaryStructure(req.user, structure.employee)) {
    throw ApiError.forbidden('You are not authorized to deactivate this salary structure.');
  }

  structure.isActive = false;
  await structure.save();

  logAudit(req, {
    action: 'salaryStructure.deactivate',
    targetType: 'SalaryStructure',
    targetId: structure._id,
    description: `Deactivated salary structure for employee ${structure.employee}`,
  });

  res.json({ ok: true, message: 'Salary structure deactivated.' });
});