/* Designation API — master list of job titles, each belonging to a department.
   Read: every authenticated role (needed by forms and filters).
   Write: HR, ADMIN, Super Admin only.
   Deactivation is soft (isActive=false) and blocked if any employee
   still references this designation — reassign them first.
   Identity and scoping come from req.user (set by authenticate),
   never from the client. */
const Designation = require('../models/Designation');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const MANAGE_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN'];

/* GET /api/designations?departmentId= — designations, optionally filtered by department */
exports.list = catchAsync(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  const designations = await Designation.find(filter)
    .sort({ order: 1, name: 1 })
    .select('name departmentId level isActive order createdAt updatedAt');
  res.json({ count: designations.length, designations });
});

/* POST /api/designations — create a designation (HR/Admin/Super Admin) */
exports.create = catchAsync(async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to create designations.');
  }
  const { name, departmentId, level } = req.body;
  if (!name || !name.trim()) throw ApiError.badRequest('Designation name is required.');
  if (!departmentId) throw ApiError.badRequest('departmentId is required.');
  const dept = await Department.findById(departmentId);
  if (!dept || !dept.isActive) throw ApiError.badRequest('Invalid or inactive department.');
  const existing = await Designation.findOne({ name: name.trim(), departmentId });
  if (existing) throw ApiError.conflict('A designation with this name already exists in this department.');
  const desig = await Designation.create({
    name: name.trim(),
    departmentId,
    level: level ? level.trim() : undefined,
    createdBy: req.user.employeeId || req.user.id || undefined,
  });
  res.status(201).json({ designation: desig });
});

/* PATCH /api/designations/:id — update or soft-delete (HR/Admin/Super Admin) */
exports.update = catchAsync(async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to update designations.');
  }
  const desig = await Designation.findById(req.params.id);
  if (!desig) throw ApiError.notFound('Designation not found.');
  const { name, departmentId, level, isActive, order } = req.body;
  if (name !== undefined) {
    if (!name || !name.trim()) throw ApiError.badRequest('Designation name is required.');
    const clash = await Designation.findOne({
      name: name.trim(),
      departmentId: departmentId !== undefined ? departmentId : desig.departmentId,
      _id: { $ne: desig._id },
    });
    if (clash) throw ApiError.conflict('A designation with this name already exists in this department.');
    desig.name = name.trim();
  }
  if (departmentId !== undefined) {
    const dept = await Department.findById(departmentId);
    if (!dept || !dept.isActive) throw ApiError.badRequest('Invalid or inactive department.');
    desig.departmentId = departmentId;
  }
  if (level !== undefined) desig.level = level ? level.trim() : undefined;
  if (isActive !== undefined) desig.isActive = Boolean(isActive);
  if (order !== undefined) desig.order = Number(order);
  await desig.save();
  res.json({ designation: desig });
});

/* DELETE /api/designations/:id — soft-delete; blocked if employees reference it */
exports.remove = catchAsync(async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to delete designations.');
  }
  const desig = await Designation.findById(req.params.id);
  if (!desig) throw ApiError.notFound('Designation not found.');
  const usedBy = await Employee.countDocuments({ designation: desig.name });
  if (usedBy > 0) {
    throw ApiError.conflict(
      `Cannot deactivate "${desig.name}": ${usedBy} employee(s) are still assigned to it. Reassign them first.`
    );
  }
  desig.isActive = false;
  await desig.save();
  res.json({ ok: true, message: 'Designation deactivated.' });
});
