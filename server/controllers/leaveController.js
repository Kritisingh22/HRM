/* Leave API. Employees create/see their own requests; managers see & decide
 * their team's; HR/Admin/SUPER_ADMIN see & manage everything. Approvals are
 * role-gated (leaves:approve) AND object-level scoped. Leave balance is
 * derived from stored Leave records (Approved counts as used, Pending is
 * reserved, Rejected/Cancelled are freed). Balance changes run inside a
 * Mongoose transaction where supported, falling back to safe sequential writes. */
const mongoose = require("mongoose");
const Leave = require("../models/Leave");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { logAudit } = require("../utils/audit");
const { userHasPermission } = require("../utils/permissions");
const { teamEmployeeIds } = require("../utils/teamScope");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];

// role sets for quick checks
const HR_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"];
const MANAGER_ROLES = ["MANAGER"];
const ALL_APPROVER_ROLES = ["MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];

/*
 * Return the Employee record linked to the authenticated user.
 * Looks up by user _id or by the user's employeeId string.
 */
async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

/*
 * Given an employee's manager employeeId string, find the User document
 * that represents that manager (if any).
 */
async function findManagerUser(managerEmployeeId) {
  if (!managerEmployeeId) return null;
  const emp = await Employee.findOne({ employeeId: managerEmployeeId }).lean();
  if (!emp || !emp.user) return null;
  return User.findById(emp.user._id).lean();
}

/*
 * Multi-document transactions require a replica set or mongos. The dev/test DB
 * is a standalone (in-memory) server where transactions are unavailable, so we
 * detect support and fall back to a safe sequential path.
 */
function supportsTransactions() {
  try {
    const topo = mongoose.connection.getClient().topology;
    const type = topo && topo.description && topo.description.type;
    return type === "ReplicaSetWithPrimary" || type === "Sharded";
  } catch (e) {
    return false;
  }
}

/*
 * Check whether the requested date range overlaps any existing Pending or
 * Approved leave for the same employee. Returns the conflicting record or null.
 */
async function findOverlappingLeave(employeeId, from, to, excludeId = null) {
  const filter = {
    employee: employeeId,
    status: { $in: ["Pending", "Approved"] },
    from: { $lte: to },
    to: { $gte: from },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Leave.findOne(filter);
}

/*
 * Compute the leave days already used (Approved) + reserved (Pending) for one
 * employee and leave type in the current calendar year. Returns { used, pending }.
 */
async function usedDaysThisYear(employeeId, type) {
  const year = new Date().getFullYear();
  const rows = await Leave.aggregate([
    { $match: {
      employee: employeeId,
      type,
      status: { $in: ["Approved", "Pending"] },
      from: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31T23:59:59Z`) },
    }},
    { $group: { _id: "$status", days: { $sum: "$days" } } },
  ]);
  const used = (rows.find((r) => r._id === "Approved") || {}).days || 0;
  const pending = (rows.find((r) => r._id === "Pending") || {}).days || 0;
  return { used, pending };
}

/* GET /api/leaves — list leave requests scoped by user role */
exports.list = catchAsync(async (req, res) => {
  if (
    !userHasPermission(req.user, "leaves:read") &&
    !userHasPermission(req.user, "leaves:read_own")
  ) {
    throw ApiError.forbidden("You do not have permission to view leave records.");
  }

  let filter = {};

  // SUPER_ADMIN / ADMIN see all leaves (optionally filtered by status)
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, "leaves:read")
  ) {
    filter = {};
  } else if (req.user.role === "HR") {
    // HR can see all employees they manage (team scope)
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } };
  } else if (req.user.role === "MANAGER") {
    // Manager sees only their reporting line
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } };
  } else {
    // Employee sees only their own requests
    const me = await myEmployee(req.user);
    filter = { employee: me ? me._id : null };
  }

  // Optional status filter
  if (req.query.status) filter.status = req.query.status;

  const leaves = await Leave.find(filter)
    .populate("employee", "employeeId fullName department")
    .sort({ appliedOn: -1 })
    .limit(500);
  res.json({ count: leaves.length, leaves });
});

/* GET /api/leaves/:id — leave request details (object-level scoped).
 * Returns 403 when the record exists but the caller is out of scope. */
exports.getOne = catchAsync(async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate(
    "employee",
    "employeeId fullName department",
  );
  if (!leave) throw ApiError.notFound("Leave request not found.");

  // Object-level scoping:
  // - SUPER_ADMIN / ADMIN: see all
  // - HR: see employees in their team scope
  // - Manager: see their team members
  // - Employee: only their own
  const canAccess = async () => {
    if (SEES_ALL.includes(req.user.role)) return true;
    if (req.user.role === "HR") {
      const ids = await teamEmployeeIds(req.user);
      return ids.some((id) => String(id) === String(leave.employee._id));
    }
    if (req.user.role === "MANAGER") {
      const ids = await teamEmployeeIds(req.user);
      return ids.some((id) => String(id) === String(leave.employee._id));
    }
    // Employee or any other role: only their own
    const me = await myEmployee(req.user);
    return (
      me &&
      (String(me._id) === String(leave.employee._id) ||
        String(me.employeeId) === String(leave.employee.employeeId))
    );
  };

  if (!(await canAccess())) {
    throw ApiError.forbidden("You do not have permission to view this leave request.");
  }
  res.json({ leave });
});

/* POST /api/leaves — authenticated users apply for themselves by default.
 * HR/Admin may still specify an employee for administrative workflows.
 * approvalAuthority can be 'Manager' | 'HR' | 'Admin' | 'Super Admin'.
 * applicantRole and applicantUserId are set from the requesting user. */
exports.create = catchAsync(async (req, res) => {
  if (
    !userHasPermission(req.user, "leaves:write") &&
    !userHasPermission(req.user, "leaves:write_own")
  ) {
    throw ApiError.forbidden("You do not have permission to create leave requests.");
  }

  let employeeId = req.body.employee;
  if (!employeeId || SEES_ALL.includes(req.user.role)) {
    // If the user is Admin/Super Admin and didn't specify an employee,
    // we need to determine which employee this is for.
    // For now, employees can only file for themselves.
    const me = await myEmployee(req.user);
    if (!me)
      throw ApiError.badRequest("No employee record linked to your account.");
    employeeId = me._id;
  }
  if (!employeeId) throw ApiError.badRequest("employee is required.");

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
  if (days <= 0) throw ApiError.badRequest("Leave duration must be at least 0.5 day.");

  const approvalAuthority = req.body.approvalAuthority || "Manager";
  // Validate approvalAuthority against allowed values
  if (
    !["Manager", "HR", "Admin", "Super Admin"].includes(approvalAuthority)
  ) {
    throw ApiError.badRequest(
      "approvalAuthority must be Manager, HR, Admin, or Super Admin.",
    );
  }

  const leaveType = req.body.type;
  if (!leaveType || leaveType.trim() === "") {
    throw ApiError.badRequest("Leave type is required.");
  }

  // Overlap prevention: no Pending or Approved leave may share dates with this request.
  const overlap = await findOverlappingLeave(employeeId, from, to);
  if (overlap) {
    throw ApiError.conflict(
      `These dates overlap with an existing ${overlap.status.toLowerCase()} leave request (${overlap.id}).`,
    );
  }

  // Balance check: non-Unpaid leave cannot exceed the remaining entitlement.
  if (leaveType !== "Unpaid Leave") {
    const ent = entitlement();
    const total = ent[leaveType];
    if (total !== undefined) {
      const { used, pending } = await usedDaysThisYear(employeeId, leaveType);
      const remaining = Math.max(0, total - used - pending);
      if (days > remaining) {
        throw ApiError.badRequest(
          `Insufficient ${leaveType} balance: ${remaining} day(s) remaining, ${days} day(s) requested.`,
        );
      }
    }
  }

  // Determine applicant role and user ID from the authenticated user
  const applicantRole = req.user.role;
  const applicantUserId = req.user._id;

  const leave = await Leave.create({
    employee: employeeId,
    applicantUserId,
    applicantRole,
    type: leaveType,
    from,
    to,
    days, // server-calculated; any client-provided value is ignored
    halfDay,
    reason: req.body.reason,
    status: "Pending",
    approvalAuthority,
  });

  // Notify the appropriate approver(s) — only after the DB write succeeds.
  await notifyApprovers(leave, approvalAuthority);

  res.status(201).json({ leave });
});

/*
 * Helper: determine if a user can approve/reject a given leave request.
 * Returns an object { canApprove, reason } where reason is set when denied.
 */
async function checkCanApprove(leave, user) {
  // Super Admin and Admin can always approve/reject in the centralized queue
  if (SEES_ALL.includes(user.role)) {
    // ADMIN can approve everything except their own leave (which needs Super Admin)
    // SUPER_ADMIN can approve everything, but their own needs alternative process
    if (user.role === "SUPER_ADMIN" && String(leave.applicantUserId) === String(user._id)) {
      return { canApprove: false, reason: "Super Admin cannot approve their own leave; an alternative approver is designated." };
    }
    // ADMIN can approve all leaves except their own
    if (user.role === "ADMIN" && String(leave.applicantUserId) === String(user._id)) {
      return { canApprove: false, reason: "Admin cannot approve their own leave; Super Admin must review." };
    }
    return { canApprove: true, reason: null };
  }

  // HR can approve HR-authorized requests and Manager-authorized requests
  if (user.role === "HR") {
    // HR can approve any request that has approvalAuthority of 'HR' or 'Manager'
    if (
      leave.approvalAuthority === "Manager" ||
      leave.approvalAuthority === "HR"
    ) {
      return { canApprove: true, reason: null };
    }
    return {
      canApprove: false,
      reason: "Only Manager or HR-authorized requests can be approved by HR.",
    };
  }

  // Manager can only approve their own team's manager-authorized requests
  if (MANAGER_ROLES.includes(user.role)) {
    if (leave.approvalAuthority !== "Manager") {
      return {
        canApprove: false,
        reason: "Only Manager-authorized requests can be approved by a Manager.",
      };
    }
    // Check if this employee is in the manager's team
    const me = await myEmployee(user);
    if (!me) {
      return { canApprove: false, reason: "Could not determine employee record." };
    }
    // The employee's manager field should match the current user's employeeId
    if (leave.employee.manager && String(leave.employee.manager) === String(me.employeeId)) {
      return { canApprove: true, reason: null };
    }
    // Also allow if the leave employee is directly managed by this manager
    // via the Employee.manager field
    return {
      canApprove: false,
      reason: "You can only decide leave requests for your own team members.",
    };
  }

  // Employee can only approve their own (but that's prevented below)
  return { canApprove: false, reason: "You do not have permission to approve this request." };
}

/* PUT /api/leaves/:id — approve / reject / cancel */
exports.update = catchAsync(async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate(
    "employee",
    "employeeId manager",
  );
  if (!leave) throw ApiError.notFound("Leave request not found.");
  const action = req.body.status; // Approved | Rejected | Cancelled

  if (action === "Cancelled") {
    // An employee may cancel their OWN Pending or Approved request.
    // HR/Admin may cancel any non-final request.
    if (!SEES_ALL.includes(req.user.role)) {
      const me = await myEmployee(req.user);
      const isOwner = me && String(leave.employee._id) === String(me._id);
      if (!isOwner) {
        throw ApiError.forbidden("You can only cancel your own request.");
      }
      if (leave.status === "Rejected" || leave.status === "Cancelled") {
        throw ApiError.badRequest(`Cannot cancel a ${leave.status.toLowerCase()} request.`);
      }
    } else {
      // HR/Admin cancelling: only Pending or Approved can be cancelled.
      if (leave.status === "Rejected" || leave.status === "Cancelled") {
        throw ApiError.badRequest(`Cannot cancel a ${leave.status.toLowerCase()} request.`);
      }
    }
  } else if (action === "Approved" || action === "Rejected") {
    // Self-approval prevention: the applicant cannot decide their own request.
    if (String(leave.applicantUserId) === String(req.user._id)) {
      throw ApiError.forbidden("You cannot approve or reject your own leave request.");
    }

    // Cannot re-decide an already-decided request (prevents double-processing).
    if (leave.status !== "Pending") {
      throw ApiError.badRequest(`This request is already ${leave.status.toLowerCase()}.`);
    }

    // Rejection requires a reason (mandatory).
    if (action === "Rejected" && !req.body.rejectionReason) {
      throw ApiError.badRequest("A rejection reason is required.");
    }

    // Check approval permissions for this user/leave combination
    const canApproveResult = await checkCanApprove(leave, req.user);
    if (!canApproveResult.canApprove) {
      throw ApiError.forbidden(canApproveResult.reason || "You do not have permission to approve/reject this leave request.");
    }

    // Additional permission check via the generic permission system
    const hasApprovePerm = userHasPermission(req.user, "leaves:approve");
    if (!hasApprovePerm) {
      throw ApiError.forbidden("You do not have permission to approve/reject leave requests.");
    }
  } else {
    throw ApiError.badRequest("status must be Approved, Rejected or Cancelled.");
  }

  // Apply the decision inside a transaction where supported, so balance
  // bookkeeping and the status change are atomic. Falls back to safe
  // sequential writes on standalone servers.
  const applyDecision = async (session) => {
    const opts = session ? { session } : {};
    const now = new Date();

    leave.status = action;
    leave.decidedBy = req.user._id;
    leave.decidedAt = now;
    if (req.body.rejectionReason !== undefined) leave.rejectionReason = req.body.rejectionReason;
    if (req.body.managerNote !== undefined) leave.managerNote = req.body.managerNote;

    if (action === "Approved") {
      if (leave.balanceDeducted) {
        throw ApiError.conflict("Leave balance has already been deducted for this request.");
      }
      leave.balanceDeducted = true; // mark that days are deducted from balance
      // Clear any pending rejection reason if previously rejected then re-approved
      leave.rejectionReason = undefined;
    } else if (action === "Cancelled" && leave.status === "Approved" && leave.balanceDeducted && !leave.balanceRestored) {
      // Cancelling an approved request restores the deducted balance.
      leave.balanceRestored = true;
    } else if (action === "Rejected") {
      // On rejection, do NOT deduct leave balance
      leave.balanceDeducted = false;
      // Keep rejection reason on the record
    }

    await leave.save(opts);
  };

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => applyDecision(session));
    } finally {
      await session.endSession();
    }
  } else {
    await applyDecision(null);
  }

  // Notify the employee of the decision — only after the DB write succeeds.
  await notifyEmployeeOfDecision(leave, action);

  // Notify the designated approver when an employee cancels their own pending request.
  if (action === "Cancelled" && !SEES_ALL.includes(req.user.role)) {
    try {
      const employee = await Employee.findById(leave.employee).populate("user", "_id email fullName").lean();
      if (employee && employee.user) {
        // Notify the assigned approver based on approvalAuthority.
        if (leave.approvalAuthority === "Manager" && employee.manager) {
          const managerEmp = await Employee.findOne({ employeeId: employee.manager }).populate("user", "_id email fullName").lean();
          if (managerEmp && managerEmp.user) {
            await Notification.create({
              user: managerEmp.user._id,
              type: "Leave Cancelled",
              title: `Leave Cancelled — ${employee.fullName}`,
              message: `${employee.fullName} (${employee.employeeId}) cancelled their ${leave.type} leave request (${leave.id}).`,
              relatedEntity: { type: "Leave", id: leave._id },
              channels: { inApp: true, email: false },
              priority: "Normal",
              metadata: { leaveId: leave._id, action: "cancelled" },
            });
          }
        } else if (leave.approvalAuthority === "HR") {
          const hrUsers = await User.find({ role: { $in: ["HR", "ADMIN", "SUPER_ADMIN"] }, status: "active" }).select("_id").lean();
          for (const hrUser of hrUsers) {
            await Notification.create({
              user: hrUser._id,
              type: "Leave Cancelled",
              title: `Leave Cancelled — ${employee.fullName}`,
              message: `${employee.fullName} (${employee.employeeId}) cancelled their ${leave.type} leave request (${leave.id}).`,
              relatedEntity: { type: "Leave", id: leave._id },
              channels: { inApp: true, email: false },
              priority: "Normal",
              metadata: { leaveId: leave._id, action: "cancelled" },
            });
          }
        }
      }
    } catch (err) {
      console.error("[Leave] Failed to notify approver of cancellation:", err.message);
    }
  }

  if (action === "Approved" || action === "Rejected") {
    const who = (leave.employee && leave.employee.employeeId) || leave.employee;
    logAudit(req, {
      action: "leave." + action.toLowerCase(),
      targetType: "Leave",
      targetId: leave._id,
      description: `${action} leave for ${who}`,
    });
  } else if (action === "Cancelled") {
    logAudit(req, {
      action: "leave.cancelled",
      targetType: "Leave",
      targetId: leave._id,
      description: `Cancelled leave for ${(leave.employee && leave.employee.employeeId) || leave.employee}`,
    });
  }
  res.json({ leave });
});

/* GET /api/leaves/calendar — returns leave data aggregated by date for calendar view. */
exports.calendar = catchAsync(async (req, res) => {
  if (
    !userHasPermission(req.user, "leaves:read") &&
    !userHasPermission(req.user, "leaves:read_own")
  ) {
    throw ApiError.forbidden("You do not have permission to view leave calendar.");
  }

  let filter = {};
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, "leaves:read")
  ) {
    filter = {};
  } else if (req.user.role === "HR") {
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } };
  } else if (req.user.role === "MANAGER") {
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } };
  } else {
    const me = await myEmployee(req.user);
    filter = { employee: me ? me._id : null };
  }
  if (req.query.status) filter.status = req.query.status;

  const leaves = await Leave.find(filter)
    .populate("employee", "employeeId fullName department")
    .sort({ from: 1 });

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
  if (!userHasPermission(req.user, "leaves:delete")) {
    throw ApiError.forbidden("You do not have permission to delete leave requests.");
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
    } else if (approvalAuthority === "Admin") {
      // Admin-authorized requests: notify Super Admin and other Admins
      const adminUsers = await User.find({
        role: { $in: ["ADMIN", "SUPER_ADMIN"] },
        status: "active",
      })
        .select("_id")
        .lean();
      for (const adminUser of adminUsers) {
        notifications.push({
          user: adminUser._id,
          type: "Leave Request",
          title: `New Leave Request — ${employee.fullName}`,
          message: `${employee.fullName} (${employee.employeeId}) has requested ${leave.type} from ${leave.from.toISOString().split("T")[0]} to ${leave.to.toISOString().split("T")[0]}. Approval authority: Admin.`,
          relatedEntity: { type: "Leave", id: leave._id },
          channels: { inApp: true, email: false },
          priority: "Normal",
          metadata: { leaveId: leave._id, approvalAuthority },
        });
      }
    } else if (approvalAuthority === "Super Admin") {
      // Super Admin-authorized requests: notify all authorized approvers
      const allUsers = await User.find({
        role: { $in: ["HR", "ADMIN", "SUPER_ADMIN"] },
        status: "active",
      })
        .select("_id")
        .lean();
      for (const user of allUsers) {
        notifications.push({
          user: user._id,
          type: "Leave Request",
          title: `New Leave Request — ${employee.fullName}`,
          message: `${employee.fullName} (${employee.employeeId}) has requested ${leave.type} from ${leave.from.toISOString().split("T")[0]} to ${leave.to.toISOString().split("T")[0]}. Approval authority: Super Admin.`,
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

/* GET /api/leaves/management — leave management records for HR/Admin/Super Admin.
 * Returns employee and HR leave records with full details including approval
 * status, approver details, and remarks. */
exports.management = catchAsync(async (req, res) => {
  if (
    !userHasPermission(req.user, "leaves:read") &&
    !userHasPermission(req.user, "leaves:manage")
  ) {
    throw ApiError.forbidden("You do not have permission to view leave management records.");
  }

  let filter = {};

  // SUPER_ADMIN / ADMIN see all leaves
  if (SEES_ALL.includes(req.user.role) && userHasPermission(req.user, "leaves:read")) {
    filter = {};
  } else if (req.user.role === "HR") {
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } };
  } else {
    const me = await myEmployee(req.user);
    filter = { employee: me ? me._id : null };
  }

  // Optional status filter
  if (req.query.status) filter.status = req.query.status;

  const leaves = await Leave.find(filter)
    .populate("employee", "employeeId fullName department designation")
    .populate("decidedBy", "fullName role")
    .sort({ appliedOn: -1 })
    .limit(500);

  res.json({ count: leaves.length, leaves });
});