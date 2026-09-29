/* Payroll API — every read/write goes through ONE authorization decision so
 * list / getOne / getPayslip / create / update cannot drift apart:
 *   Employee → own payslips only
 *   Manager  → own + authorized team (teamScope), never another manager's team
 *   HR       → own + employees currently assigned to that HR
 *   Admin    → all, except Management-department payslips (existing rule)
 * A client-supplied ?employee=/body.employee can only NARROW within that scope,
 * never widen it. */
const Payroll = require("../models/Payroll");
const Employee = require("../models/Employee");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { logAudit } = require("../utils/audit");
const { userHasPermission } = require("../utils/permissions");
const { SEES_ALL, teamEmployeeIds } = require("../utils/teamScope");

const HR_ROLES = ["ADMIN", "SUPER_ADMIN"];

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

const PROFESSIONAL_TAX = 200;

function salaryBreakdown(employee) {
  const gross = Math.max(0, Number(employee.salary || 0));
  const basic = Math.floor(gross * 0.5);
  const hra = Math.floor(gross * 0.2);
  const conveyance = Math.min(1600, gross - basic - hra);
  const special = gross - basic - hra - conveyance;
  return {
    basic,
    allowances: { hra, conveyance, special, other: 0 },
    bonus: 0,
    overtime: 0,
    gross,
    deductions: {
      professionalTax: Math.min(PROFESSIONAL_TAX, gross),
      loanAdvance: 0,
    },
  };
}

async function assignedHrEmployeeIds(user) {
  if (!user.employeeId) return [];
  const employees = await Employee.find({ assignedHrId: user.employeeId })
    .select("_id")
    .lean();
  return employees.map((employee) => employee._id);
}

async function isAssignedToHr(user, employeeId) {
  if (user.role !== "HR" || !user.employeeId) return false;
  return !!(await Employee.exists({
    _id: employeeId,
    assignedHrId: user.employeeId,
  }));
}

// Masks all but the last 4 characters of an account number for display.
function maskAccount(v) {
  if (!v) return null;
  const str = String(v);
  return str.length <= 4 ? str : "X".repeat(str.length - 4) + str.slice(-4);
}

const MANAGEMENT_DEPTS = ["Project Management", "Management"];

// The single "may this user read this employee's payroll?" decision.
async function canReadPayrollOf(user, employeeDoc) {
  if (!employeeDoc) return false;
  if (user.role === "HR") return isAssignedToHr(user, employeeDoc._id);
  if (HR_ROLES.includes(user.role))
    return !MANAGEMENT_DEPTS.includes(employeeDoc.department);
  if (user.role === "MANAGER" && userHasPermission(user, "payroll:read")) {
    const ids = await teamEmployeeIds(user);
    return ids.some((id) => String(id) === String(employeeDoc._id));
  }
  const me = await myEmployee(user);
  return !!me && String(me._id) === String(employeeDoc._id);
}

// Write scope: admins may write for anyone; anyone else only within their scope.
async function canWritePayrollOf(user, employeeObjectId) {
  if (SEES_ALL.includes(user.role)) return true;
  if (user.role === "HR") return isAssignedToHr(user, employeeObjectId);
  if (
    user.role !== "MANAGER" ||
    !userHasPermission(user, "payroll:write") ||
    !userHasPermission(user, "payroll:read")
  )
    return false;
  const ids = await teamEmployeeIds(user);
  return ids.some((id) => String(id) === String(employeeObjectId));
}

/* GET /api/payroll */
exports.list = catchAsync(async (req, res) => {
  let filter = {};

  if (HR_ROLES.includes(req.user.role)) {
    // Admin/Super Admin: all employees except Management-department payslips.
    const managerIds = await Employee.find({
      department: { $in: MANAGEMENT_DEPTS },
    })
      .select("_id")
      .lean();
    filter.employee = { $nin: managerIds.map((m) => m._id) };
    if (req.query.employee) {
      if (
        managerIds.some(
          (employee) => String(employee._id) === String(req.query.employee),
        )
      )
        throw ApiError.forbidden(
          "You do not have permission to view this employee's payroll.",
        );
      filter.employee = req.query.employee;
    }
  } else if (req.user.role === "HR" || req.user.role === "MANAGER") {
    const ids =
      req.user.role === "HR"
        ? await assignedHrEmployeeIds(req.user)
        : userHasPermission(req.user, "payroll:read")
          ? await teamEmployeeIds(req.user)
          : [(await myEmployee(req.user))?._id].filter(Boolean);
    if (req.query.employee) {
      // Narrow only — an id outside this caller's scope is refused, not honored.
      if (!ids.some((id) => String(id) === String(req.query.employee)))
        throw ApiError.forbidden(
          "You do not have permission to view this employee's payroll.",
        );
      filter.employee = req.query.employee;
    } else {
      filter.employee = { $in: ids };
    }
  } else {
    // Employee: own payslips only (any ?employee= is ignored).
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }
  if (req.query.period) filter.period = req.query.period;

  const payslips = await Payroll.find(filter)
    .populate(
      "employee",
      "employeeId fullName department designation assignedHrId",
    )
    .sort({ period: -1 })
    .limit(500);
  res.json({ count: payslips.length, payroll: payslips });
});

/* GET /api/payroll/:id — object-level authorization */
exports.getOne = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id).populate(
    "employee",
    "employeeId fullName user department designation assignedHrId",
  );
  if (!slip) throw ApiError.notFound("Payslip not found.");

  // Single shared authorization decision (see canReadPayrollOf).
  if (!(await canReadPayrollOf(req.user, slip.employee))) {
    throw ApiError.forbidden(
      "You do not have permission to view this payslip.",
    );
  }
  res.json({ payslip: slip });
});

/* GET /api/payroll/:id/payslip — safe, print-ready projection of a real record */
exports.getPayslip = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id).populate(
    "employee",
    "employeeId fullName email phone department designation manager employmentType location joiningDate user bankName accountNumber ifsc accountHolderName assignedHrId",
  );
  if (!slip) throw ApiError.notFound("Payslip not found.");

  if (!(await canReadPayrollOf(req.user, slip.employee))) {
    throw ApiError.forbidden(
      "You do not have permission to view this payslip.",
    );
  }

  const employee = slip.employee;
  res.json({
    payslip: {
      id: slip._id,
      period: slip.period,
      basic: slip.basic,
      allowances: slip.allowances,
      bonus: slip.bonus,
      overtime: slip.overtime,
      gross: slip.gross,
      deductions: slip.deductions,
      net: slip.net,
      status: slip.status,
      payDate: slip.payDate || null,
      createdAt: slip.createdAt,
      employee: {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        assignedHrId: employee.assignedHrId || null,
        email: employee.email || null,
        phone: employee.phone || null,
        department: employee.department || null,
        designation: employee.designation || null,
        manager: employee.manager || null,
        employmentType: employee.employmentType || null,
        location: employee.location || null,
        joiningDate: employee.joiningDate || null,
      },
      payment: {
        status: slip.status,
        date: slip.payDate || null,
        mode: slip.paymentMode || "Bank Transfer",
        transactionId: slip.transactionId || null,
        reference: slip.reference || null,
        utr: slip.utr || null,
        bankName: employee.bankName || null,
        accountNumber: maskAccount(employee.accountNumber),
        ifsc: employee.ifsc || null,
        accountHolderName: employee.accountHolderName || null,
        amount: slip.net,
        currency: "INR",
      },
    },
  });
});

/* POST /api/payroll (payroll:write) */
exports.create = catchAsync(async (req, res) => {
  const { employee, period, gross } = req.body;
  if (!employee || !period)
    throw ApiError.badRequest("employee and period are required.");
  // payroll:write does not mean "write for anyone" — target must be in scope.
  if (!(await canWritePayrollOf(req.user, employee)))
    throw ApiError.forbidden(
      "You are not authorized to create payroll for this employee.",
    );
  const employeeRecord =
    await Employee.findById(employee).select("assignedHrId");
  if (!employeeRecord) throw ApiError.notFound("Employee not found.");
  const slip = await Payroll.create({
    employee,
    assignedHrId: employeeRecord.assignedHrId || null,
    period,
    gross: gross || 0,
    ...(req.body.basic !== undefined ? { basic: req.body.basic } : {}),
    ...(req.body.allowances !== undefined
      ? { allowances: req.body.allowances }
      : {}),
    bonus: req.body.bonus || 0,
    overtime: req.body.overtime || 0,
    deductions: req.body.deductions || {},
    paymentMode: req.body.paymentMode,
    transactionId: req.body.transactionId,
    reference: req.body.reference,
    utr: req.body.utr,
    status: req.body.status || "Draft",
  });
  logAudit(req, {
    action: "payroll.create",
    targetType: "Payroll",
    targetId: slip._id,
    description: `Created payslip ${period} (net ${slip.net}) for employee ${employee}`,
  });
  res.status(201).json({ payslip: slip });
});

/* POST /api/payroll/generate — derives a monthly payroll from persisted employee salary. */
exports.generate = catchAsync(async (req, res) => {
  const period = String(req.body.period || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw ApiError.badRequest("period must use YYYY-MM format.");

  let employees;
  if (req.user.role === "HR") {
    if (!req.user.employeeId)
      throw ApiError.forbidden(
        "Your account is not linked to an HR employee record.",
      );
    employees = await Employee.find({
      assignedHrId: req.user.employeeId,
      salary: { $gt: 0 },
      status: { $ne: "Exited" },
    }).sort({ employeeId: 1 });
  } else if (HR_ROLES.includes(req.user.role)) {
    employees = await Employee.find({
      department: { $nin: MANAGEMENT_DEPTS },
      salary: { $gt: 0 },
      status: { $ne: "Exited" },
    }).sort({ employeeId: 1 });
  } else if (
    req.user.role === "MANAGER" &&
    userHasPermission(req.user, "payroll:write") &&
    userHasPermission(req.user, "payroll:read")
  ) {
    const ids = await teamEmployeeIds(req.user);
    employees = await Employee.find({
      _id: { $in: ids },
      salary: { $gt: 0 },
      status: { $ne: "Exited" },
    }).sort({ employeeId: 1 });
  } else {
    throw ApiError.forbidden("You do not have permission to generate payroll.");
  }

  const payroll = [];
  for (const employee of employees) {
    const existing = await Payroll.findOne({ employee: employee._id, period });
    if (existing && existing.status !== "Draft") {
      payroll.push(existing);
      continue;
    }
    const values = salaryBreakdown(employee);
    if (existing) {
      existing.assignedHrId = employee.assignedHrId || null;
      Object.assign(existing, values);
      await existing.save();
      payroll.push(existing);
    } else {
      payroll.push(
        await Payroll.create({
          employee: employee._id,
          assignedHrId: employee.assignedHrId || null,
          period,
          status: "Draft",
          ...values,
        }),
      );
    }
  }

  logAudit(req, {
    action: "payroll.generate",
    targetType: "Payroll",
    description: `Generated ${period} payroll for ${payroll.length} employees`,
  });
  res.status(201).json({ count: payroll.length, payroll });
});

/* POST /api/payroll/employee/:employeeId/generate — generate one selected employee's payslip. */
exports.generateForEmployee = catchAsync(async (req, res) => {
  const period = String(req.body.period || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw ApiError.badRequest("period must use YYYY-MM format.");
  const employee = await Employee.findOne({
    employeeId: req.params.employeeId,
  });
  if (!employee) throw ApiError.notFound("Employee not found.");
  if (!(await canWritePayrollOf(req.user, employee._id)))
    throw ApiError.forbidden(
      "You are not authorized to generate payroll for this employee.",
    );
  if (
    SEES_ALL.includes(req.user.role) &&
    MANAGEMENT_DEPTS.includes(employee.department)
  )
    throw ApiError.forbidden(
      "You do not have permission to access this employee's payroll.",
    );
  if (employee.status === "Exited" || Number(employee.salary || 0) <= 0)
    throw ApiError.badRequest(
      "The selected employee has no active salary to generate payroll from.",
    );

  const existing = await Payroll.findOne({ employee: employee._id, period });
  if (existing && existing.status !== "Draft") {
    return res.json({ payslip: existing });
  }
  const values = salaryBreakdown(employee);
  let payslip;
  if (existing) {
    existing.assignedHrId = employee.assignedHrId || null;
    Object.assign(existing, values);
    payslip = await existing.save();
  } else {
    payslip = await Payroll.create({
      employee: employee._id,
      assignedHrId: employee.assignedHrId || null,
      period,
      status: "Draft",
      ...values,
    });
  }
  logAudit(req, {
    action: "payroll.generate",
    targetType: "Payroll",
    targetId: payslip._id,
    description: `Generated ${period} payroll for employee ${employee.employeeId}`,
  });
  res.status(existing ? 200 : 201).json({ payslip });
});

/* PUT /api/payroll/:id (payroll:write) */
exports.update = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id);
  if (!slip) throw ApiError.notFound("Payslip not found.");
  if (!(await canWritePayrollOf(req.user, slip.employee)))
    throw ApiError.forbidden(
      "You are not authorized to modify this employee's payroll.",
    );
  ["gross", "status", "payDate"].forEach((k) => {
    if (req.body[k] !== undefined) slip[k] = req.body[k];
  });
  [
    "basic",
    "bonus",
    "overtime",
    "paymentMode",
    "transactionId",
    "reference",
    "utr",
  ].forEach((k) => {
    if (req.body[k] !== undefined) slip[k] = req.body[k];
  });
  if (req.body.allowances !== undefined) {
    const current =
      slip.allowances && slip.allowances.toObject
        ? slip.allowances.toObject()
        : slip.allowances || {};
    slip.allowances = { ...current, ...req.body.allowances };
  }
  if (req.body.deductions !== undefined) {
    // deep-merge so a partial update can't wipe unrelated deduction components (pf/tds/esi/other)
    const current =
      slip.deductions && slip.deductions.toObject
        ? slip.deductions.toObject()
        : slip.deductions || {};
    slip.deductions = { ...current, ...req.body.deductions };
  }
  await slip.save(); // pre-save recomputes net; min:0 validators reject a negative net
  res.json({ payslip: slip });
});
