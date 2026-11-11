/* Employees API with object-level (row-level) authorization:
 *  - HR / ADMIN / SUPER_ADMIN: all employees
 *  - MANAGER: their team + themselves
 *  - EMPLOYEE: themselves only
 * Changing the :id in the URL to someone else's record yields 403, not data. */
const mongoose = require("mongoose");
const crypto = require("crypto");
const cfg = require("../config/env");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const Counter = require("../models/Counter");
const Document = require("../models/Document");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { SEES_ALL, scopeFilter, teamEmployeeIds } = require("../utils/teamScope");
const { hasPermission, userHasPermission, permissionsFor } = require("../utils/permissions");
const { logAudit } = require("../utils/audit");
const { 
  generateUniqueEmployeeId, 
  getInitials, 
  getDatePrefix, 
  getNextSerial,
  DEPARTMENT_SERIAL_MAP 
} = require("../utils/employeeIdGenerator");
const { hashToken } = require("../utils/tokens");
const { putObject } = require("../services/storage");
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const HR_ACCESS = ["HR", "ADMIN", "SUPER_ADMIN"];
const canCreateEmployees = (role) => userHasPermission({ role, permissions: [] }, 'employees:write') || userHasPermission({ role, permissions: [] }, 'employees:update');
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

/* POST /api/employees   (employees:write / employees:update)
 *
 * Creates an employee record AND provisions a linked login account
 * (User) atomically. Also generates an offer letter PDF and stores
 * it as a Document record associated with the employee.
 *
 * Role rules:
 *   HR / ADMIN / SUPER_ADMIN — may create any employee.
 *   MANAGER                  — may create employees only within their
 *                              team scope (the manager becomes the
 *                              reporting manager).
 *   EMPLOYEE                 — never allowed (403).
 *
 * The employeeId is ALWAYS generated server-side — the frontend may
 * never supply or overwrite it. The temporary activation token is
 * returned once (never the password — the password hash is stored,
 * never the plaintext).
 */
exports.create = catchAsync(async (req, res) => {
  const body = pick(req.body);
  const creator = req.user;

  // ---- permission check ----
  const isPrivileged = HR_ACCESS.includes(creator.role);
  if (!isPrivileged && creator.role !== 'MANAGER') {
    throw ApiError.forbidden('Only HR, Admin, Manager or Super Admin can create employees.');
  }
  if (creator.role === 'MANAGER') {
    /* Managers may only onboard reports: they become the reporting
       manager and the employee must be within the manager's team scope. */
    if (!body.manager || String(body.manager) !== String(creator.employeeId)) {
      throw ApiError.forbidden('Managers can only create employees who report to them.');
    }
    body.reportingManagerId = creator._id;
  }

  if (!body.fullName) {
    throw ApiError.badRequest("fullName is required.");
  }
  if (!body.email) {
    throw ApiError.badRequest("Official email is required.");
  }
  if (!body.joiningDate || !body.department) {
    throw ApiError.badRequest("joiningDate and department are required.");
  }

  // ---- duplicate email check ----
  const emailLower = String(body.email).trim().toLowerCase();
  const existingUser = await User.findOne({ email: emailLower });
  if (existingUser) {
    throw ApiError.conflict('An account with this official email already exists.');
  }
  const existingEmp = await Employee.findOne({ email: emailLower });
  if (existingEmp) {
    throw ApiError.conflict('An employee record with this official email already exists.');
  }

  // ---- validate departmentId / designationId ----
  if (body.departmentId) {
    const dept = await Department.findById(body.departmentId);
    if (!dept || !dept.isActive) {
      throw ApiError.badRequest("Invalid or inactive department.");
    }
    if (!body.department) body.department = dept.name;
    else if (body.department !== dept.name) {
      throw ApiError.badRequest("departmentId does not match department name.");
    }
  }
  if (body.designationId) {
    const desig = await Designation.findById(body.designationId);
    if (!desig || !desig.isActive) {
      throw ApiError.badRequest("Invalid or inactive designation.");
    }
    if (body.departmentId && String(desig.departmentId) !== String(body.departmentId)) {
      throw ApiError.badRequest("Designation does not belong to the specified department.");
    }
    if (!body.designation) body.designation = desig.name;
    else if (body.designation !== desig.name) {
      throw ApiError.badRequest("designationId does not match designation name.");
    }
  }

  // ---- derive first/last name ----
  const nameParts = String(body.fullName).trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  // ---- generate employeeId server-side (never from frontend) ----
  body.employeeId = await generateUniqueEmployeeId({
    fullName: body.fullName,
    joiningDate: body.joiningDate,
    department: body.department,
  });

  // ---- temporary password + activation token (never stored plaintext) ----
  const tempPassword = crypto.randomBytes(16).toString('base64url'); // secure temp password
  const activationToken = crypto.randomBytes(32).toString('base64url');
  const activationTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const saltRounds = cfg.BCRYPT_ROUNDS;
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(tempPassword, saltRounds);
  const activationTokenHash = hashToken(activationToken);

  // ---- atomic write: employee + user (transaction where supported) ----
  const supportsTx = supportsTransactions();
  let emp, user;
  if (supportsTx) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        emp = await Employee.create([{
          employeeId: body.employeeId,
          user: null, // set after user is created
          userId: null,
          fullName: body.fullName,
          firstName,
          lastName,
          email: emailLower,
          personalEmail: body.personalEmail || null,
          phone: body.phone || null,
          gender: body.gender || null,
          dateOfBirth: body.dateOfBirth || null,
          address: body.address || null,
          emergencyContact: body.emergencyContact || null,
          department: body.department,
          departmentId: body.departmentId || null,
          designation: body.designation,
          designationId: body.designationId || null,
          manager: creator.role === 'MANAGER' ? creator.employeeId : (body.manager || null),
          reportingManagerId: creator.role === 'MANAGER' ? creator._id : (body.reportingManagerId || null),
          employmentType: body.employmentType || 'Full-time',
          workMode: body.workMode || 'On-site',
          workLocation: body.workLocation || 'office',
          bloodGroup: body.bloodGroup || 'Unknown',
          assignedHrId: creator.role === 'HR' ? (creator.employeeId || null) : (body.assignedHrId || null),
          location: body.location || null,
          joiningDate: body.joiningDate,
          salary: isPrivileged && body.salary != null ? Number(body.salary) : 0,
          grade: body.grade || null,
          status: body.status || 'Active',
          createdBy: creator._id,
          createdByRole: creator.role,
        }], { session })[0];

        user = await User.create([{
          employeeId: body.employeeId,
          fullName: body.fullName,
          email: emailLower,
          passwordHash,
          role: 'EMPLOYEE',
          permissions: permissionsFor('EMPLOYEE'),
          department: body.department,
          designation: body.designation,
          manager: creator.role === 'MANAGER' ? creator._id : null,
          status: 'active',
          isVerified: false,
          accountStatus: 'pending-activation',
          mustChangePassword: true,
          activationToken: activationTokenHash,
          activationTokenExpires,
        }], { session })[0];

        // link both sides
        emp.user = user._id;
        emp.userId = String(user._id);
        await emp.save({ session });
        user.employeeId = body.employeeId;
        await user.save({ session });

        return { emp, user };
      });
      emp = result.emp;
      user = result.user;
    } finally {
      await session.endSession();
    }
  } else {
    /* Standalone fallback: safe sequential writes. Employee first so
       the user link has a target; if user creation fails the employee
       row is left (no orphaned user without an employee). */
    emp = await Employee.create({
      employeeId: body.employeeId,
      fullName: body.fullName,
      firstName,
      lastName,
      email: emailLower,
      personalEmail: body.personalEmail || null,
      phone: body.phone || null,
      gender: body.gender || null,
      dateOfBirth: body.dateOfBirth || null,
      address: body.address || null,
      emergencyContact: body.emergencyContact || null,
      department: body.department,
      departmentId: body.departmentId || null,
      designation: body.designation,
      designationId: body.designationId || null,
      manager: creator.role === 'MANAGER' ? creator.employeeId : (body.manager || null),
      reportingManagerId: creator.role === 'MANAGER' ? creator._id : (body.reportingManagerId || null),
      employmentType: body.employmentType || 'Full-time',
      workMode: body.workMode || 'On-site',
      workLocation: body.workLocation || 'office',
      bloodGroup: body.bloodGroup || 'Unknown',
      assignedHrId: creator.role === 'HR' ? (creator.employeeId || null) : (body.assignedHrId || null),
      location: body.location || null,
      joiningDate: body.joiningDate,
      salary: isPrivileged && body.salary != null ? Number(body.salary) : 0,
      grade: body.grade || null,
      status: body.status || 'Active',
      createdBy: creator._id,
      createdByRole: creator.role,
    });
    user = await User.create({
      employeeId: body.employeeId,
      fullName: body.fullName,
      email: emailLower,
      passwordHash,
      role: 'EMPLOYEE',
      permissions: permissionsFor('EMPLOYEE'),
      department: body.department,
      designation: body.designation,
      manager: creator.role === 'MANAGER' ? creator._id : null,
      status: 'active',
      isVerified: false,
      accountStatus: 'pending-activation',
      mustChangePassword: true,
      activationToken: activationTokenHash,
      activationTokenExpires,
    });
    emp.user = user._id;
    emp.userId = String(user._id);
    await emp.save();
    user.employeeId = body.employeeId;
    await user.save();
  }

  // ---- audit ----
  logAudit(req, {
    action: 'employee.create',
    targetType: 'Employee',
    targetId: emp.employeeId,
    description: `Created employee ${emp.employeeId} (${emp.fullName}) + login account (pending activation), created by ${creator.role} ${creator.employeeId || creator._id}`,
  });

  // ---- generate offer letter PDF ----
  let offerLetterResult = null;
  try {
    offerLetterResult = await generateAndStoreOfferLetter(emp, user, creator);
  } catch (e) {
    // Offer letter failure must not roll back employee creation.
    console.error('[employee.create] offer letter generation failed:', e.message);
  }

  res.status(201).json({
    employee: {
      employeeId: emp.employeeId,
      fullName: emp.fullName,
      email: emp.email,
      department: emp.department,
      designation: emp.designation,
      manager: emp.manager,
      employmentType: emp.employmentType,
      joiningDate: emp.joiningDate,
      status: emp.status,
      userId: emp.userId,
    },
    account: {
      employeeId: user.employeeId,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      mustChangePassword: user.mustChangePassword,
    },
    activationToken, // returned ONCE — client must deliver it to the employee out-of-band
    offerLetter: offerLetterResult,
  });
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

  // Validate departmentId change if provided
  if (changes.departmentId !== undefined) {
    const dept = await Department.findById(changes.departmentId);
    if (!dept || !dept.isActive) {
      throw ApiError.badRequest("Invalid or inactive department.");
    }
    if (changes.department && changes.department !== dept.name) {
      throw ApiError.badRequest("departmentId does not match department name.");
    }
    if (!changes.department) {
      changes.department = dept.name;
    }
  }

  // Validate designationId change if provided
  if (changes.designationId !== undefined) {
    const desig = await Designation.findById(changes.designationId);
    if (!desig || !desig.isActive) {
      throw ApiError.badRequest("Invalid or inactive designation.");
    }
    const deptId = changes.departmentId !== undefined ? changes.departmentId : emp.departmentId;
    if (deptId && String(desig.departmentId) !== String(deptId)) {
      throw ApiError.badRequest("Designation does not belong to the specified department.");
    }
    if (!changes.designation) {
      changes.designation = desig.name;
    } else if (changes.designation !== desig.name) {
      throw ApiError.badRequest("designationId does not match designation name.");
    }
  }

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
    "firstName",
    "lastName",
    "email",
    "personalEmail",
    "phone",
    "gender",
    "dateOfBirth",
    "address",
    "emergencyContact",
    "department",
    "departmentId",
    "designation",
    "designationId",
    "manager",
    "reportingManagerId",
    "employmentType",
    "workMode",
    "workLocation",
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

/* ---- Offer letter PDF generation --------------------------------------- */

/** Build a professionally formatted offer letter PDF buffer. */
async function buildOfferLetterPdf(emp, user, creator) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 60;
  let y = height - margin;

  const companyName = 'CYETHACK Solution';
  const companyAddr = 'Registered Office, Cyber Hub, Noida — Uttar Pradesh, India';
  const companyContact = 'Email: hr@cyethack.com  |  Phone: +91 120 4567 890';

  const refNum = `OFFER/${emp.employeeId}/${new Date().getFullYear()}`;
  const issueDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const joiningDate = new Date(emp.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const salaryTxt = emp.salary && emp.salary > 0 ? `INR ${Number(emp.salary).toLocaleString('en-IN')} per annum` : 'As per company compensation policy';

  function wrapText(text, maxWidth, f, size) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const trial = (cur ? cur + ' ' : '') + w;
      if (f.widthOfTextAtSize(trial, size) <= maxWidth) cur = trial;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function write(text, x, yPos, f = font, size = 11, color = rgb(0.1, 0.1, 0.1), lineHeight = 15) {
    const lines = Array.isArray(text) ? text : [String(text)];
    for (const line of lines) {
      page.drawText(line, { x, y: yPos, font: f, size, color });
      yPos -= lineHeight;
    }
    return yPos;
  }

  // Header
  y = write(companyName, margin, y, fontBold, 18, rgb(0.12, 0.35, 0.25));
  y = write(companyAddr, margin, y, font, 9, rgb(0.4, 0.4, 0.4));
  y = write(companyContact, margin, y, font, 9, rgb(0.4, 0.4, 0.4));
  y -= 10;

  // Title
  y = write('OFFER LETTER', margin, y, fontBold, 16, rgb(0.12, 0.35, 0.25));
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.5, 0.5, 0.5) });
  y -= 20;

  // Body
  y = write(`Date: ${issueDate}`, margin, y);
  y = write(`Ref No: ${refNum}`, margin, y);
  y -= 10;
  y = write(`To,`, margin, y);
  y = write(`${emp.fullName}`, margin, y, fontBold);
  y = write(`${emp.email}`, margin, y);
  y -= 10;
  y = write('Subject: Offer of Employment — ' + (emp.designation || 'Position'), margin, y, fontBold);
  y -= 14;

  const bodyLines = [
    `Dear ${emp.firstName || emp.fullName},`,
    '',
    `We are pleased to offer you the position of ${emp.designation || 'Team Member'} in the ${emp.department || 'department'} at ${companyName}.`,
    `Your employee ID will be ${emp.employeeId} and your reporting manager is ${emp.manager || 'to be assigned'}.`,
    '',
    `Employment Type: ${emp.employmentType || 'Full-time'}`,
    `Work Location: ${emp.workLocation || 'Office'}`,
    `Joining Date: ${joiningDate}`,
    `Salary/Compensation: ${salaryTxt}`,
    `Grade: ${emp.grade || '—'}`,
    '',
    `This offer is contingent upon successful completion of any pre-employment checks and your account activation.`,
    `Please sign and return a copy of this letter to indicate your acceptance of the offer.`,
    '',
    'We look forward to welcoming you to the team.',
    '',
    'Yours sincerely,',
    '',
    'Authorized Signatory',
    `${creator.fullName || 'HR Administrator'}`,
    `${creator.role || 'HR'} — ${companyName}`,
  ];
  y = write(bodyLines, margin, y, font, 10, undefined, 16);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/** Generate offer letter PDF, store it, and create a Document record. */
async function generateAndStoreOfferLetter(emp, user, creator) {
  const pdfBuffer = await buildOfferLetterPdf(emp, user, creator);
  const originalName = `Offer Letter - ${emp.employeeId}.pdf`;
  const storageKey = `offer-letters/${emp.employeeId}/${Date.now()}.pdf`;

  const stored = await putObject({
    key: storageKey,
    buffer: pdfBuffer,
    contentType: 'application/pdf',
    originalName,
  });

  const doc = await Document.create({
    title: `Offer Letter — ${emp.fullName}`,
    category: 'Contract',
    owner: emp._id,
    employee: emp._id,
    type: 'Offer Letter',
    visibility: 'private',
    scope: 'personal',
    storageKey: stored.key,
    originalName,
    mimeType: 'application/pdf',
    size: stored.size,
    uploadedBy: user._id,
    uploaderRole: creator.role,
    storageProvider: stored.provider,
    r2Key: stored.provider === 'cloudflare-r2' ? stored.key : undefined,
    checksum: stored.checksum,
  });

  return {
    documentId: doc._id,
    referenceId: doc.referenceId,
    title: doc.title,
    category: doc.category,
    size: doc.size,
    storageProvider: doc.storageProvider,
    createdAt: doc.createdAt,
  };
}
