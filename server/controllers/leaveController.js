/* Leave API. Employees create/see their own requests; managers see & decide
 * their team's; HR/Admin see & manage everything. Approvals are role-gated
 * (leaves:approve) AND object-level scoped for managers. */
const Leave = require("../models/Leave");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { logAudit } = require("../utils/audit");
const { userHasPermission } = require("../utils/permissions");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}
async function teamEmployeeIds(user) {
  const team = await Employee.find({ manager: user.employeeId }).select("_id");
  return team.map((e) => e._id);
}

/* GET /api/leaves */
exports.list = catchAsync(async (req, res) => {
  // Check permission first
  if (
    !userHasPermission(req.user, "leaves:read") &&
    !userHasPermission(req.user, "leaves:read_own")
  ) {
    throw ApiError.forbidden(
      "You do not have permission to view leave records.",
    );
  }

  let filter = {};
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, "leaves:read")
  ) {
    filter = {};
  } else if (req.user.role === "HR") {
    const ids = await Employee.find({
      assignedHrId: req.user.employeeId,
    }).select("_id");
    const me = await myEmployee(req.user);
    const arr = ids.map((e) => e._id);
    if (me) arr.push(me._id);
    filter = { employee: { $in: arr } };
  } else if (req.user.role === "MANAGER") {
    const ids = await teamEmployeeIds(req.user);
    const me = await myEmployee(req.user);
    if (me) ids.push(me._id);
    filter = { employee: { $in: ids } };
  } else {
    const me = await myEmployee(req.user);
    filter = { employee: me ? me._id : null };
  }
  if (req.query.status) filter.status = req.query.status;
  const leaves = await Leave.find(filter)
    .populate("employee", "employeeId fullName department")
    .sort({ appliedOn: -1 })
    .limit(500);
  res.json({ count: leaves.length, leaves });
});

/* POST /api/leaves — authenticated users apply for themselves by default.
 * HR/Admin may still specify an employee for administrative workflows.
 * approvalAuthority can be 'Manager' or 'HR' - determines who approves the request. */
exports.create = catchAsync(async (req, res) => {
  // Check permission
  if (
    !userHasPermission(req.user, "leaves:write") &&
    !userHasPermission(req.user, "leaves:write_own")
  ) {
    throw ApiError.forbidden(
      "You do not have permission to create leave requests.",
    );
  }

  let employeeId = req.body.employee;
  if (!employeeId || !SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    if (!me)
      throw ApiError.badRequest("No employee record linked to your account.");
    employeeId = me._id; // employees can only file for themselves
  }
  if (!employeeId) throw ApiError.badRequest("employee is required.");

  // Server computes the duration — a client-supplied `days` is never trusted.
  const from = new Date(req.body.from);
  const to = new Date(req.body.to);
  if (isNaN(from.getTime()) || isNaN(to.getTime()))
    throw ApiError.badRequest("Valid from and to dates are required.");
  if (from > to)
    throw ApiError.badRequest(
      'Leave "from" date must be on or before the "to" date.',
    );
  const halfDay = !!req.body.halfDay;
  const days = halfDay ? 0.5 : Math.floor((to - from) / 86400000) + 1; // inclusive day count

  const approvalAuthority = req.body.approvalAuthority || "Manager";
  if (!["Manager", "HR"].includes(approvalAuthority)) {
    throw ApiError.badRequest("approvalAuthority must be Manager or HR.");
  }

  const leave = await Leave.create({
    employee: employeeId,
    requestedBy: req.user._id,
    type: req.body.type,
    from,
    to,
    days, // server-calculated; any client-provided value is ignored
    halfDay,
    reason: req.body.reason,
    status: "Pending",
    approvalAuthority,
  });

  // Notify the appropriate approver(s)
  await notifyApprovers(leave, approvalAuthority);

  res.status(201).json({ leave });
});

/* PUT /api/leaves/:id — approve / reject (managers: team only, HR: based on approvalAuthority) or cancel own */
exports.update = catchAsync(async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate(
    "employee",
    "employeeId manager",
  );
  if (!leave) throw ApiError.notFound("Leave request not found.");
  const action = req.body.status; // Approved | Rejected | Cancelled

  if (action === "Cancelled") {
    // an employee may cancel their OWN pending request
    const me = await myEmployee(req.user);
    const isOwner = me && String(leave.employee._id) === String(me._id);
    if (!isOwner && !SEES_ALL.includes(req.user.role))
      throw ApiError.forbidden("You can only cancel your own request.");
  } else if (action === "Approved" || action === "Rejected") {
    // Check approval authority
    const isHR = req.user.role === "HR" || SEES_ALL.includes(req.user.role);
    const isManager = req.user.role === "MANAGER";

    if (leave.approvalAuthority === "Manager") {
      // Only managers can approve/reject manager-assigned requests
      if (!isManager && !isHR) {
        throw ApiError.forbidden(
          "Only the assigned manager or HR can decide this leave request.",
        );
      }
      // Manager must be the employee's manager
      if (leave.employee.manager !== req.user.employeeId) {
        throw ApiError.forbidden(
          "You can only decide leave requests for your own team members.",
        );
      }
    } else if (leave.approvalAuthority === "HR") {
      // Only HR/Admin can approve/reject HR-assigned requests
      if (!isHR) {
        throw ApiError.forbidden("Only HR can decide this leave request.");
      }
    }

    const hasApprovePerm = userHasPermission(req.user, "leaves:approve");
    if (!hasApprovePerm) {
      throw ApiError.forbidden(
        "You do not have permission to approve/reject leave requests.",
      );
    }
    leave.decidedBy = req.user._id;
  } else {
    throw ApiError.badRequest(
      "status must be Approved, Rejected or Cancelled.",
    );
  }
  leave.status = action;
  if (req.body.managerNote !== undefined)
    leave.managerNote = req.body.managerNote;
  await leave.save();

  // Notify the employee of the decision
  await notifyEmployeeOfDecision(leave, action);

  if (action === "Approved" || action === "Rejected") {
    const who = (leave.employee && leave.employee.employeeId) || leave.employee;
    logAudit(req, {
      action: "leave." + action.toLowerCase(),
      targetType: "Leave",
      targetId: leave._id,
      description: `${action} leave for ${who}`,
    });
  }
  res.json({ leave });
});

/* GET /api/leaves/calendar — returns leave data aggregated by date for calendar view.
 * Scoped the same as list: Employee sees own, Manager sees team, HR/Admin sees all. */
exports.calendar = catchAsync(async (req, res) => {
  // Check permission first
  if (
    !userHasPermission(req.user, "leaves:read") &&
    !userHasPermission(req.user, "leaves:read_own")
  ) {
    throw ApiError.forbidden(
      "You do not have permission to view leave calendar.",
    );
  }

  let filter = {};
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, "leaves:read")
  ) {
    filter = {};
  } else if (req.user.role === "HR") {
    const ids = await Employee.find({
      assignedHrId: req.user.employeeId,
    }).select("_id");
    const me = await myEmployee(req.user);
    const arr = ids.map((e) => e._id);
    if (me) arr.push(me._id);
    filter = { employee: { $in: arr } };
  } else if (req.user.role === "MANAGER") {
    const ids = await teamEmployeeIds(req.user);
    const me = await myEmployee(req.user);
    if (me) ids.push(me._id);
    filter = { employee: { $in: ids } };
  } else {
    const me = await myEmployee(req.user);
    filter = { employee: me ? me._id : null };
  }
  if (req.query.status) filter.status = req.query.status;

  const leaves = await Leave.find(filter)
    .populate("employee", "employeeId fullName department")
    .sort({ from: 1 });

  // Transform into date-keyed map for calendar rendering
  const byDate = {};
  for (const l of leaves) {
    const from = new Date(l.from);
    const to = new Date(l.to);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0]; // YYYY-MM-DD
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({
        _id: l._id,
        type: l.type,
        status: l.status,
        employee: l.employee,
        halfDay: l.halfDay,
        days: l.days,
        from: l.from,
        to: l.to,
        reason: l.reason,
        approvalAuthority: l.approvalAuthority,
      });
    }
  }

  res.json({ byDate });
});

/* DELETE /api/leaves/:id — HR/Admin only (route-guarded) */
exports.remove = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, "leaves:delete")) {
    throw ApiError.forbidden(
      "You do not have permission to delete leave requests.",
    );
  }
  const leave = await Leave.findByIdAndDelete(req.params.id);
  if (!leave) throw ApiError.notFound("Leave request not found.");
  res.json({ ok: true });
});

// Helper: Notify approvers when a leave request is created
async function notifyApprovers(leave, approvalAuthority) {
  try {
    const employee = await Employee.findById(leave.employee)
      .populate("user", "_id email fullName")
      .lean();
    if (!employee || !employee.user) return;

    const notifications = [];

    if (approvalAuthority === "Manager" && employee.manager) {
      // Find the manager's user account
      const managerEmp = await Employee.findOne({
        employeeId: employee.manager,
      })
        .populate("user", "_id email fullName")
        .lean();
      if (managerEmp && managerEmp.user) {
        notifications.push({
          user: managerEmp.user._id,
          type: "Leave Request",
          title: `New Leave Request — ${employee.fullName}`,
          message: `${employee.fullName} (${employee.employeeId}) has requested ${leave.type} from ${leave.from.toISOString().split("T")[0]} to ${leave.to.toISOString().split("T")[0]}. Approval authority: Manager.`,
          relatedEntity: { type: "Leave", id: leave._id },
          channels: { inApp: true, email: false },
          priority: "Normal",
          metadata: { leaveId: leave._id, approvalAuthority },
        });
      }
    } else if (approvalAuthority === "HR") {
      // Notify all HR users
      const hrUsers = await User.find({
        role: { $in: ["HR", "ADMIN", "SUPER_ADMIN"] },
        status: "active",
      })
        .select("_id")
        .lean();
      for (const hrUser of hrUsers) {
        notifications.push({
          user: hrUser._id,
          type: "Leave Request",
          title: `New Leave Request — ${employee.fullName}`,
          message: `${employee.fullName} (${employee.employeeId}) has requested ${leave.type} from ${leave.from.toISOString().split("T")[0]} to ${leave.to.toISOString().split("T")[0]}. Approval authority: HR.`,
          relatedEntity: { type: "Leave", id: leave._id },
          channels: { inApp: true, email: false },
          priority: "Normal",
          metadata: { leaveId: leave._id, approvalAuthority },
        });
      }
    }

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error("[Leave] Failed to notify approvers:", err.message);
  }
}

// Helper: Notify employee of leave decision
async function notifyEmployeeOfDecision(leave, action) {
  try {
    const employee = await Employee.findById(leave.employee)
      .populate("user", "_id email fullName")
      .lean();
    if (!employee || !employee.user) return;

    await Notification.create({
      user: employee.user._id,
      type: "Leave Decision",
      title: `Leave Request ${action} — ${leave.type}`,
      message: `Your ${leave.type} request from ${leave.from.toISOString().split("T")[0]} to ${leave.to.toISOString().split("T")[0]} has been ${action.toLowerCase()}.`,
      relatedEntity: { type: "Leave", id: leave._id },
      channels: { inApp: true, email: false },
      priority: action === "Approved" ? "Normal" : "High",
      metadata: { leaveId: leave._id, action },
    });
  } catch (err) {
    console.error("[Leave] Failed to notify employee:", err.message);
  }
}
