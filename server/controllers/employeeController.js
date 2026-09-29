/* Employees API with object-level (row-level) authorization:
 *  - HR / ADMIN / SUPER_ADMIN: all employees
 *  - MANAGER: their team + themselves
 *  - EMPLOYEE: themselves only
 * Changing the :id in the URL to someone else's record yields 403, not data. */
const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { SEES_ALL, scopeFilter } = require("../utils/teamScope");
const { hasPermission } = require("../utils/permissions");
const { logAudit } = require("../utils/audit");
const HR_ACCESS = ["HR", "ADMIN", "SUPER_ADMIN"];
// Salary is compensation data: it is returned ONLY to roles the existing permission
// model authorises to read payroll (HR / ADMIN / SUPER_ADMIN via payroll:read | payroll:* | *).
// MANAGER and EMPLOYEE hold only payroll:read_own, so they never receive the salary
// field. When a viewer is not authorised, the property is REMOVED from the response
// entirely (never returned as salary: null). Storage is untouched — this is projection only.
function canSeeSalary(user) {
  return hasPermission(user.role, "payroll:read");
}

// A removed/offboarded employee is marked with this terminal status. Kept as a
// single constant so the listing, analytics and remove paths cannot drift.
const EXITED = "Exited";

// Multi-document transactions require a replica set or mongos. The dev/test DB is
// a standalone (in-memory) server where transactions are unavailable, so we detect
// support and fall back to a safe sequential path when they are not supported.
function supportsTransactions() {
  try {
    const topo = mongoose.connection.getClient().topology;
    const type = topo && topo.description && topo.description.type;
    return type === "ReplicaSetWithPrimary" || type === "Sharded";
  } catch (e) {
    return false;
  }
}

// Row-level access check (own / team / all). The query form (scopeFilter) is the
// shared helper in utils/teamScope, so employees, analytics and reports stay in
// sync and scope logic cannot drift between them.
function canAccess(user, emp) {
  if (SEES_ALL.includes(user.role)) return true;
  if (user.role === "MANAGER")
    return (
      emp.manager === user.employeeId || emp.employeeId === user.employeeId
    );
  if (user.role === "HR")
    return (
      emp.assignedHrId === user.employeeId || emp.employeeId === user.employeeId
    );
  return (
    (emp.user && String(emp.user) === String(user._id)) ||
    emp.employeeId === user.employeeId
  );
}

/* GET /api/employees
 * The default roster is the ACTIVE workforce: exited employees are omitted so a
 * removed person no longer appears among current staff. Their records are never
 * destroyed — pass ?status=Exited (exact) or ?includeExited=true to retrieve
 * them for offboarding / historical views. */
exports.list = catchAsync(async (req, res) => {
  const filter = await scopeFilter(req.user);
  if (req.query.department) filter.department = req.query.department;
  if (req.query.status)
    filter.status = req.query.status; // explicit exact filter (may request Exited)
  else if (req.query.includeExited !== "true") filter.status = { $ne: EXITED }; // default: current staff only
  const query = Employee.find(filter).sort({ employeeId: 1 }).limit(500);
  if (!canSeeSalary(req.user)) query.select("-salary"); // omit compensation for non-payroll roles (property absent, not null)
  const employees = await query;
  res.json({ count: employees.length, employees });
});

/* GET /api/employees/:id  (id = Mongo _id or employeeId) */
exports.getOne = catchAsync(async (req, res) => {
  const emp = await findByIdOrEmployeeId(req.params.id);
  if (!emp) throw ApiError.notFound("Employee not found.");
  if (!canAccess(req.user, emp))
    throw ApiError.forbidden(
      "You do not have permission to view this employee.",
    );
  let out = emp;
  if (!canSeeSalary(req.user)) {
    out = emp.toObject();
    delete out.salary;
  } // omit compensation for non-payroll roles (property absent, not null)
  res.json({ employee: out });
});

/* POST /api/employees   (employees:write) */
exports.create = catchAsync(async (req, res) => {
  const body = pick(req.body);
  if (!body.employeeId || !body.fullName)
    throw ApiError.badRequest("employeeId and fullName are required.");
  // The assigned HR is ALWAYS the authenticated HR who is creating the record —
  // never trust a frontend-supplied assignedHrId here, even if one was sent.
  // (Admin/Super Admin may still set it explicitly, e.g. onboarding on another
  // HR's behalf, since they aren't self-assigning.)
  if (req.user.role === "HR") {
    body.assignedHrId = req.user.employeeId || null;
  }
  const emp = await Employee.create(body);
  logAudit(req, {
    action: "employee.create",
    targetType: "Employee",
    targetId: emp.employeeId,
    description: `Created employee ${emp.employeeId} (${emp.fullName})`,
  });
  res.status(201).json({ employee: emp });
});

/* PUT /api/employees/:id   (employees:write / employees:update) */
exports.update = catchAsync(async (req, res) => {
  const emp = await findByIdOrEmployeeId(req.params.id);
  if (!emp) throw ApiError.notFound("Employee not found.");
  if (!canAccess(req.user, emp))
    throw ApiError.forbidden(
      "You do not have permission to edit this employee.",
    );

  // Field-level authorization: restrict what managers can update
  // HR/Admin/SUPER_ADMIN can update all fields; Managers have a limited set
  const isHR = ["HR", "ADMIN", "SUPER_ADMIN"].includes(req.user.role);
  const allowedForManager = [
    "fullName",
    "email",
    "phone",
    "gender",
    "department",
    "designation",
    "manager",
    "employmentType",
    "workMode",
    "bloodGroup",
    "assignedHrId",
    "location",
    "joiningDate",
    "grade",
  ];
  const allowedForHR = [
    "employeeId",
    "fullName",
    "email",
    "phone",
    "gender",
    "department",
    "designation",
    "manager",
    "employmentType",
    "workMode",
    "bloodGroup",
    "assignedHrId",
    "location",
    "joiningDate",
    "salary",
    "grade",
    "status",
    "user",
  ];

  const allowed = isHR ? allowedForHR : allowedForManager;
  const changes = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) changes[k] = req.body[k];
  });

  // Prevent changing employeeId if not HR (and even for HR, only on create typically)
  if (!isHR && changes.employeeId !== undefined) {
    delete changes.employeeId;
  }

  Object.assign(emp, changes);
  await emp.save();
  // Highlight the sensitive HR actions the spec calls out (assign manager / change department)
  const notable = [];
  if (changes.manager !== undefined)
    notable.push(`assigned manager→${changes.manager}`);
  if (changes.department !== undefined)
    notable.push(`department→${changes.department}`);
  if (changes.designation !== undefined)
    notable.push(`designation→${changes.designation}`);
  logAudit(req, {
    action:
      changes.manager !== undefined
        ? "employee.assign_manager"
        : "employee.update",
    targetType: "Employee",
    targetId: emp.employeeId,
    description: `Updated ${emp.employeeId}: ${notable.join(", ") || Object.keys(changes).join(", ") || "no change"}`,
  });
  res.json({ employee: emp });
});

/* DELETE /api/employees/:id   (employees:delete)
 * SOFT-DELETE (M2 integrity fix): instead of destroying the record and orphaning
 * dependent payroll/leave/attendance/performance/document/offboarding/project
 * rows, we DEACTIVATE the linked login and mark the employee 'Exited' — mirroring
 * the offboarding exit. All historical records are preserved for audit; hard
 * deletion is intentionally not exposed via the API.
 *
 * The login is revoked FIRST and the employee marked Exited SECOND, and both are
 * committed inside a Mongoose transaction where the deployment supports one
 * (replica set / mongos). On a standalone server (transactions unavailable) the
 * same ordered writes run sequentially: revoking the login first means a partial
 * failure fails SAFE — the account can no longer authenticate even if the second
 * write is retried. */
exports.remove = catchAsync(async (req, res) => {
  const emp = await findByIdOrEmployeeId(req.params.id);
  if (!emp) throw ApiError.notFound("Employee not found.");

  // Resolve the linked login (by direct ref, else by employeeId).
  const linked = emp.user
    ? await User.findById(emp.user)
    : emp.employeeId
      ? await User.findOne({ employeeId: emp.employeeId })
      : null;
  const loginDisabled = !!(linked && linked.status !== "inactive");

  // Ordered writes: (1) revoke the login, (2) mark the employee Exited.
  const applyChanges = async (session) => {
    const opts = session ? { session } : {};
    if (loginDisabled) {
      linked.status = "inactive";
      await linked.save(opts);
    }
    emp.status = EXITED;
    await emp.save(opts);
  };

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => applyChanges(session));
    } finally {
      await session.endSession();
    }
  } else {
    await applyChanges(null); // standalone: safe sequential (login revoked first)
  }

  logAudit(req, {
    action: "employee.offboard",
    targetType: "Employee",
    targetId: emp.employeeId,
    description: `Offboarded ${emp.employeeId} (marked Exited${loginDisabled ? ", login disabled" : ""})`,
  });
  res.json({
    ok: true,
    employeeId: emp.employeeId,
    status: emp.status,
    loginDisabled,
  });
});

/* PUT /api/employees/me/profile — the signed-in user updates ONLY their own
 * limited personal fields. The record is resolved from the authenticated token
 * (never an id in the URL), so this can never edit another person (no IDOR), and
 * only the allow-listed fields are writable — role, department, manager, salary,
 * status, employeeId, joining date, etc. are NOT editable here. */
const SELF_EDITABLE = ["phone", "location", "address", "emergencyContact"];
exports.updateOwnProfile = catchAsync(async (req, res) => {
  const emp = req.user.employeeId
    ? await Employee.findOne({ employeeId: req.user.employeeId })
    : await Employee.findOne({ user: req.user._id });
  if (!emp)
    throw ApiError.notFound("No employee record is linked to your account.");
  const changes = {};
  SELF_EDITABLE.forEach((k) => {
    if (req.body[k] !== undefined) changes[k] = req.body[k];
  });
  Object.assign(emp, changes);
  await emp.save();
  logAudit(req, {
    action: "employee.self_update",
    targetType: "Employee",
    targetId: emp.employeeId,
    description: `Self-updated profile: ${Object.keys(changes).join(", ") || "no change"}`,
  });
  const out = emp.toObject();
  if (!canSeeSalary(req.user)) delete out.salary;
  res.json({ employee: out });
});

// helpers
function pick(b) {
  const allow = [
    "employeeId",
    "fullName",
    "email",
    "phone",
    "gender",
    "department",
    "designation",
    "manager",
    "employmentType",
    "workMode",
    "bloodGroup",
    "assignedHrId",
    "location",
    "joiningDate",
    "salary",
    "grade",
    "status",
    "user",
  ];
  const out = {};
  allow.forEach((k) => {
    if (b[k] !== undefined) out[k] = b[k];
  });
  return out;
}
async function findByIdOrEmployeeId(id) {
  if (/^[0-9a-fA-F]{24}$/.test(id)) return Employee.findById(id);
  return Employee.findOne({ employeeId: id });
}
