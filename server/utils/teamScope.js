/* Shared team-scoping helpers — the single source of truth for "which employees
 * may this user act on / see". Extracting this prevents the scope logic from
 * drifting between the employees, analytics and reports controllers (the root
 * cause of the M1 analytics leak). Team membership uses the EXISTING relationship
 * Employee.manager = the manager's employeeId (a STRING), never an ObjectId. */
const Employee = require("../models/Employee");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];

// Employees are scoped by relationship, not by a blanket HR-overview. HR users
// only see employees assigned to them, plus their own HR record.
function scopeFilter(user) {
  if (!user) return { _id: null };
  if (SEES_ALL.includes(user.role)) return {};
  if (user.role === "MANAGER")
    return {
      $or: [{ manager: user.employeeId }, { employeeId: user.employeeId }],
    };
  if (user.role === "HR")
    return {
      $or: [{ assignedHrId: user.employeeId }, { employeeId: user.employeeId }],
    };
  return { $or: [{ user: user._id }, { employeeId: user.employeeId }] }; // EMPLOYEE → self only
}

// The Employee documents this user may act on (own/team/all), with the fields
// needed to scope related collections (_id for Payroll/Leave/etc., department for Hiring).
async function teamEmployees(user) {
  return Employee.find(scopeFilter(user)).select("_id department employeeId");
}

// Just the Employee _ids — for { employee: { $in: ids } } filters on Payroll/Leave/Attendance/Performance.
async function teamEmployeeIds(user) {
  return (await teamEmployees(user)).map((e) => e._id);
}

module.exports = { SEES_ALL, scopeFilter, teamEmployees, teamEmployeeIds };
