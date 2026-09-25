/* Projects API. HR/Admin see all; managers and employees see projects they
 * manage or are a member of. Writing requires projects:write. */
const Project = require('../models/Project');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
async function myEmployee(user) { return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }); }

async function scopeFilter(user) {
  if (SEES_ALL.includes(user.role)) return {};
  const me = await myEmployee(user);
  if (!me) return { _id: null };
  return { $or: [{ manager: me._id }, { members: me._id }] };
}

exports.list = catchAsync(async (req, res) => {
  const filter = await scopeFilter(req.user);
  if (req.query.status) filter.status = req.query.status;
  const projects = await Project.find(filter).populate('manager', 'employeeId fullName').sort({ createdAt: -1 }).limit(500);
  res.json({ count: projects.length, projects });
});

exports.getOne = catchAsync(async (req, res) => {
  const p = await findProject(req.params.id);
  if (!p) throw ApiError.notFound('Project not found.');
  if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const ok = me && (String(p.manager) === String(me._id) || (p.members || []).map(String).includes(String(me._id)));
    if (!ok) throw ApiError.forbidden('You do not have access to this project.');
  }
  res.json({ project: p });
});

exports.create = catchAsync(async (req, res) => {
  if (!req.body.projectId || !req.body.name) throw ApiError.badRequest('projectId and name are required.');
  const p = await Project.create({ ...pick(req.body), createdBy: req.user._id });
  res.status(201).json({ project: p });
});

exports.update = catchAsync(async (req, res) => {
  const p = await findProject(req.params.id);
  if (!p) throw ApiError.notFound('Project not found.');
  if (req.user.role === 'MANAGER') {
    const me = await myEmployee(req.user);
    if (!me || String(p.manager) !== String(me._id)) throw ApiError.forbidden('You can only edit projects you manage.');
  }
  Object.assign(p, pick(req.body));
  await p.save();
  res.json({ project: p });
});

function pick(b) {
  const allow = ['projectId', 'name', 'description', 'status', 'manager', 'members', 'startDate', 'endDate', 'progress', 'tasks'];
  const out = {}; allow.forEach((k) => { if (b[k] !== undefined) out[k] = b[k]; }); return out;
}
async function findProject(id) {
  if (/^[0-9a-fA-F]{24}$/.test(id)) return Project.findById(id);
  return Project.findOne({ projectId: id });
}
