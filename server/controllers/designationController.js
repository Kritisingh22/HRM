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

function requireManage(req) {
  if (!MANAGE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission to perform this action.');
  }
}

/* Normalise a designation name for duplicate detection within a department. */
function normaliseName(name) {
  return String(name || '').trim().toLowerCase();
}

/* GET /api/designations — all designations (optionally filtered by department) */
exports.list = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  const designations = await Designation.find(filter)
    .sort({ order: 1, name: 1 })
    .select('name description departmentId level isActive order createdAt updatedAt');
  res.json({ count: designations.length, designations });
});

/* GET /api/designations/active — active designations only */
exports.listActive = catchAsync(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  const designations = await Designation.find(filter)
    .sort({ order: 1, name: 1 })
    .select('name description departmentId level isActive order createdAt updatedAt');
  res.json({ count: designations.length, designations });
});

/* GET /api/designations/department/:departmentId — designations for a department */
exports.listByDepartment = catchAsync(async (req, res) => {
  const { departmentId } = req.params;
  const dept = await Department.findById(departmentId);
  if (!dept) throw ApiError.notFound('Department not found.');
  const designations = await Designation.find({ departmentId })
    .sort({ order: 1, name: 1 })
    .select('name description departmentId level isActive order createdAt updatedAt');
  res.json({ count: designations.length, department: dept, designations });
});

/* POST /api/designations — create a designation (HR/Admin/Super Admin) */
exports.create = catchAsync(async (req, res) => {
  requireManage(req);
  const { name, departmentId, description, level, isActive, order } = req.body;
  if (!name || !name.trim()) throw ApiError.badRequest('Designation name is required.');
  if (!departmentId) throw ApiError.badRequest('departmentId is required.');
  const dept = await Department.findById(departmentId);
  if (!dept || !dept.isActive) throw ApiError.badRequest('Invalid or inactive department.');
  const normalized = normaliseName(name);
  const existing = await Designation.findOne({ departmentId, nameLower: normalized });
  if (existing) throw ApiError.conflict('A designation with this name already exists in this department.');
  const desig = await Designation.create({
    name: name.trim(),
    description: description ? String(description).trim() : '',
    departmentId,
    level: level ? String(level).trim() : undefined,
    isActive: isActive !== false,
    order: order !== undefined ? Number(order) : 0,
    createdBy: req.user.employeeId || req.user.id || undefined,
  });
  // eslint-disable-next-line no-console
  console.log(
    '[Designation.create] persisted to MongoDB:',
    desig._id,
    desig.name,
    'under department', departmentId,
    'by', req.user.employeeId || req.user.id,
  );
  res.status(201).json({ designation: desig });
});

/* PATCH /api/designations/:id — update a designation (HR/Admin/Super Admin) */
exports.update = catchAsync(async (req, res) => {
  requireManage(req);
  const desig = await Designation.findById(req.params.id);
  if (!desig) throw ApiError.notFound('Designation not found.');
  const { name, departmentId, description, level, isActive, order } = req.body;
  if (name !== undefined) {
    if (!name || !name.trim()) throw ApiError.badRequest('Designation name is required.');
    const normalized = normaliseName(name);
    const targetDeptId = departmentId !== undefined ? departmentId : desig.departmentId;
    const clash = await Designation.findOne({
      departmentId: targetDeptId,
      nameLower: normalized,
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
  if (description !== undefined) desig.description = String(description).trim();
  if (level !== undefined) desig.level = level ? String(level).trim() : undefined;
  if (isActive !== undefined) desig.isActive = Boolean(isActive);
  if (order !== undefined) desig.order = Number(order);
  await desig.save();
  res.json({ designation: desig });
});

/* PATCH /api/designations/:id/status — activate/deactivate (HR/Admin/Super Admin) */
exports.setStatus = catchAsync(async (req, res) => {
  requireManage(req);
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    throw ApiError.badRequest('isActive must be a boolean.');
  }
  const desig = await Designation.findById(req.params.id);
  if (!desig) throw ApiError.notFound('Designation not found.');
  if (!isActive) {
    const usedBy = await Employee.countDocuments({
      $or: [{ designation: desig.name }, { designationId: desig._id }],
    });
    if (usedBy > 0) {
      throw ApiError.conflict(
        `Cannot deactivate "${desig.name}": ${usedBy} employee(s) are still assigned to it. Reassign them first.`
      );
    }
  }
  desig.isActive = isActive;
  await desig.save();
  res.json({ designation: desig });
});

/* DELETE /api/designations/:id — soft-delete; blocked if employees reference it */
exports.remove = catchAsync(async (req, res) => {
  requireManage(req);
  const desig = await Designation.findById(req.params.id);
  if (!desig) throw ApiError.notFound('Designation not found.');
  const usedBy = await Employee.countDocuments({
    $or: [{ designation: desig.name }, { designationId: desig._id }],
  });
  if (usedBy > 0) {
    throw ApiError.conflict(
      `Cannot deactivate "${desig.name}": ${usedBy} employee(s) are still assigned to it. Reassign them first.`
    );
  }
  desig.isActive = false;
  await desig.save();
  res.json({ ok: true, message: 'Designation deactivated.' });
});
