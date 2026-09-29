/* Shared team-scoping helpers — the single source of truth for "which employees
 * may this user act on / see". Extracting this prevents the scope logic from
 * drifting between the employees, analytics and reports controllers (the root
 * cause of the M1 analytics leak). Team membership uses the EXISTING relationship
 * Employee.manager = the manager's employeeId (a STRING), never an ObjectId. */
const Employee = require("../models/Employee");
const AccessRequest = require("../models/AccessRequest");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];

// employeeIds this HR currently holds a LIVE approved (and not expired) access
// grant for, on top of their own assigned employees. Checked fresh on every
// call rather than cached, so an expiry or revocation takes effect immediately.
async function grantedEmployeeIds(hrEmployeeId) {
  if (!hrEmployeeId) return [];
  const grants = await AccessRequest.find({
    requestingHrId: hrEmployeeId,
    status: "Approved",
    isTransfer: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).select("employeeId");
  return grants.map((g) => g.employeeId);
}

// Employees are scoped by relationship, not by a blanket HR-overview. HR users
// only see employees assigned to them (plus any explicitly approved, live
// access-request grants), never another HR's roster by default.
async function scopeFilter(user) {
  if (!user) return { _id: null };
  if (SEES_ALL.includes(user.role)) return {};
  if (user.role === "MANAGER")
    return {
      $or: [{ manager: user.employeeId }, { employeeId: user.employeeId }],
    };
  if (user.role === "HR") {
    const granted = await grantedEmployeeIds(user.employeeId);
    return {
      $or: [
        { assignedHrId: user.employeeId },
        { employeeId: user.employeeId },
        ...(granted.length ? [{ employeeId: { $in: granted } }] : []),
      ],
    };
  }
  return { $or: [{ user: user._id }, { employeeId: user.employeeId }] }; // EMPLOYEE → self only
}

// The Employee documents this user may act on (own/team/all), with the fields
// needed to scope related collections (_id for Payroll/Leave/etc., department for Hiring).
async function teamEmployees(user) {
  return Employee.find(await scopeFilter(user)).select("_id department employeeId");
}

// Just the Employee _ids — for { employee: { $in: ids } } filters on Payroll/Leave/Attendance/Performance.
async function teamEmployeeIds(user) {
  return (await teamEmployees(user)).map((e) => e._id);
}

module.exports = { SEES_ALL, scopeFilter, teamEmployees, teamEmployeeIds };
