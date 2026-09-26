/* Payroll API. Employees/managers may read only THEIR OWN payslips; HR/Admin
 * read all and are the only ones who may create/update. */
const Payroll = require("../models/Payroll");
const Employee = require("../models/Employee");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { logAudit } = require("../utils/audit");
const {
  SEES_ALL,
  scopeFilter,
  teamEmployeeIds,
} = require("../utils/teamScope");

const MANAGER_ROLES = ["MANAGER"];
const HR_ROLES = ["ADMIN", "SUPER_ADMIN"];

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

/* GET /api/payroll */
exports.list = catchAsync(async (req, res) => {
  let filter = {};

  if (req.user.role === "HR") {
    const ids = await Employee.find({ assignedHrId: req.user.employeeId })
      .select("_id")
      .lean();
    const arr = ids.map((e) => e._id);
    const me = await myEmployee(req.user);
    if (me) arr.push(me._id);
    filter.employee = { $in: arr };
    if (req.query.employee) filter.employee = req.query.employee;
    if (req.query.period) filter.period = req.query.period;
  } else if (HR_ROLES.includes(req.user.role)) {
    // Admin/Super Admin: see all employee payslips.
    const managerIds = await Employee.find({
      department: { $in: ["Project Management", "Management"] },
    })
      .select("_id")
      .lean();
    const managerEmpIds = managerIds.map((m) => m._id);
    filter.employee = { $nin: managerEmpIds };

    if (req.query.employee) filter.employee = req.query.employee;
    if (req.query.period) filter.period = req.query.period;
  } else if (MANAGER_ROLES.includes(req.user.role)) {
    // Manager: see team's payslips + HR payslips
    const teamIds = await teamEmployeeIds(req.user);
    const hrIds = await Employee.find({ department: "Human Resources" })
      .select("_id")
      .lean();
    const hrEmpIds = hrIds.map((h) => h._id);
    const allowedIds = [...new Set([...teamIds, ...hrEmpIds])];
    filter.employee = { $in: allowedIds };

    if (req.query.period) filter.period = req.query.period;
  } else {
    // Employee: own payslips only
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }

  const payslips = await Payroll.find(filter)
    .populate("employee", "employeeId fullName department designation")
    .sort({ period: -1 })
    .limit(500);
  res.json({ count: payslips.length, payroll: payslips });
});

/* GET /api/payroll/:id — object-level authorization */
exports.getOne = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id).populate(
    "employee",
    "employeeId fullName user department designation",
  );
  if (!slip) throw ApiError.notFound("Payslip not found.");

  // Check authorization based on role
  if (HR_ROLES.includes(req.user.role)) {
    // HR/Admin/Super Admin: can see all except Manager payslips
    const targetEmp = slip.employee;
    if (
      targetEmp &&
      ["Project Management", "Management"].includes(targetEmp.department)
    ) {
      throw ApiError.forbidden(
        "You do not have permission to view this payslip.",
      );
    }
  } else if (MANAGER_ROLES.includes(req.user.role)) {
    // Manager: can see team + HR payslips
    const teamIds = await teamEmployeeIds(req.user);
    const hrIds = await Employee.find({ department: "Human Resources" })
      .select("_id")
      .lean();
    const hrEmpIds = hrIds.map((h) => h._id);
    const allowedIds = [...new Set([...teamIds, ...hrEmpIds])];

    const owns =
      slip.employee &&
      allowedIds.some((id) => String(id) === String(slip.employee._id));
    if (!owns) {
      throw ApiError.forbidden(
        "You do not have permission to view this payslip.",
      );
    }
  } else {
    // Employee: own payslips only
    const me = await myEmployee(req.user);
    const owns = me && String(slip.employee._id) === String(me._id);
    if (!owns) {
      throw ApiError.forbidden(
        "You do not have permission to view this payslip.",
      );
    }
  }
  res.json({ payslip: slip });
});

/* GET /api/payroll/:id/payslip — safe, print-ready projection of a real record */
exports.getPayslip = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id).populate(
    "employee",
    "employeeId fullName email phone department designation manager employmentType location joiningDate user bankName accountNumber ifsc accountHolderName",
  );
  if (!slip) throw ApiError.notFound("Payslip not found.");

  // Check authorization based on role
  if (HR_ROLES.includes(req.user.role)) {
    // HR/Admin/Super Admin: can see all except Manager payslips
    const targetEmp = slip.employee;
    if (
      targetEmp &&
      ["Project Management", "Management"].includes(targetEmp.department)
    ) {
      throw ApiError.forbidden(
        "You do not have permission to view this payslip.",
      );
    }
  } else if (MANAGER_ROLES.includes(req.user.role)) {
    // Manager: can see team + HR payslips
    const teamIds = await teamEmployeeIds(req.user);
    const hrIds = await Employee.find({ department: "Human Resources" })
      .select("_id")
      .lean();
    const hrEmpIds = hrIds.map((h) => h._id);
    const allowedIds = [...new Set([...teamIds, ...hrEmpIds])];

    const owns =
      slip.employee &&
      allowedIds.some((id) => String(id) === String(slip.employee._id));
    if (!owns) {
      throw ApiError.forbidden(
        "You do not have permission to view this payslip.",
      );
    }
  } else {
    // Employee: own payslips only
    const me = await myEmployee(req.user);
    const owns = me && String(slip.employee._id) === String(me._id);
    if (!owns) {
      throw ApiError.forbidden(
        "You do not have permission to view this payslip.",
      );
    }
  }

  const employee = slip.employee;
  res.json({
    payslip: {
      id: slip._id,
      period: slip.period,
      gross: slip.gross,
      deductions: slip.deductions,
      net: slip.net,
      status: slip.status,
      payDate: slip.payDate || null,
      createdAt: slip.createdAt,
      employee: {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
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
        accountNumber: employee.accountNumber || null,
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
  const slip = await Payroll.create({
    employee,
    period,
    gross: gross || 0,
    deductions: req.body.deductions || {},
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

/* PUT /api/payroll/:id (payroll:write) */
exports.update = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id);
  if (!slip) throw ApiError.notFound("Payslip not found.");
  ["gross", "status", "payDate"].forEach((k) => {
    if (req.body[k] !== undefined) slip[k] = req.body[k];
  });
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
