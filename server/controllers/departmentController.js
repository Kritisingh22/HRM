/* Department API — master list of company departments.
   Read: every authenticated role (needed by forms and filters).
   Write: HR, ADMIN, SUPER_ADMIN only.
   Deactivation is soft (isActive=false) and blocked if any employee
   still references this department — reassign them first.
   Identity and scoping come from req.user (set by authenticate),
   never from the client. */
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const MANAGE_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN'];

/* GET /api/departments — active departments, sorted by order then name */
exports.list = catchAsync(async (req, res) => {
  const departments = await Department.find({ isActive: true })
    .sort({ order: 1, name: 1 })
    .select('name code headUserId isActive order createdAt updatedAt');
  res.json({ count: departments.length, departments });
});

/* POST /api/departments — create a department (HR/Admin/Super Admin) */
exports.create = catchAsync(async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to create departments.');
  }
  const { name, code, headUserId } = req.body;
  if (!name || !name.trim()) throw ApiError.badRequest('Department name is required.');
  const existing = await Department.findOne({ name: name.trim() });
  if (existing) throw ApiError.conflict('A department with this name already exists.');
  const dept = await Department.create({
    name: name.trim(),
    code: code ? code.trim() : undefined,
    headUserId: headUserId || null,
    createdBy: req.user.employeeId || req.user.id || undefined,
  });
  res.status(201).json({ department: dept });
});

/* PATCH /api/departments/:id — update or soft-delete (HR/Admin/Super Admin) */
exports.update = catchAsync(async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to update departments.');
  }
  const dept = await Department.findById(req.params.id);
  if (!dept) throw ApiError.notFound('Department not found.');
  const { name, code, headUserId, isActive, order } = req.body;
  if (name !== undefined) {
    if (!name || !name.trim()) throw ApiError.badRequest('Department name is required.');
    const clash = await Department.findOne({ name: name.trim(), _id: { $ne: dept._id } });
    if (clash) throw ApiError.conflict('A department with this name already exists.');
    dept.name = name.trim();
  }
  if (code !== undefined) dept.code = code ? code.trim() : undefined;
  if (headUserId !== undefined) dept.headUserId = headUserId || null;
  if (isActive !== undefined) dept.isActive = Boolean(isActive);
  if (order !== undefined) dept.order = Number(order);
  await dept.save();
  res.json({ department: dept });
});

/* DELETE /api/departments/:id — soft-delete; blocked if employees reference it */
exports.remove = catchAsync(async (req, res) => {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to delete departments.');
  }
  const dept = await Department.findById(req.params.id);
  if (!dept) throw ApiError.notFound('Department not found.');
  const usedBy = await Employee.countDocuments({ department: dept.name });
  if (usedBy > 0) {
    throw ApiError.conflict(
      `Cannot deactivate "${dept.name}": ${usedBy} employee(s) are still assigned to it. Reassign them first.`
    );
  }
  dept.isActive = false;
  await dept.save();
  res.json({ ok: true, message: 'Department deactivated.' });
});
