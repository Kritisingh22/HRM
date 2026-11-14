/* ============================================================
   Salary Structure Service — versioned salary structures.

   • Creating a new version for an employee closes the previous
     active version (sets effectiveTo = newVersion.effectiveFrom - 1 day,
     isActive = false).
   • Never alters data used by a paid payroll — payrolls reference
     a specific SalaryStructure by _id, so historical payrolls are
     unaffected by new versions.
   ============================================================ */

const SalaryStructure = require('../models/SalaryStructure');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const { logAudit } = require('../utils/audit');

/**
 * Create a new salary structure version for an employee.
 * Closes the previous active version.
 * @param {Object} data - { employee, basic, hra, allowances, deductions, effectiveFrom, effectiveTo?, isActive? }
 * @param {Object} actor - Express req.user
 * @param {Object} req - Express request
 * @returns {Promise<SalaryStructure>}
 */
async function createSalaryStructureVersion(data, actor, req) {
  const { employee, basic, hra, allowances, deductions, effectiveFrom, effectiveTo, isActive } = data;

  const emp = await Employee.findById(employee);
  if (!emp) throw new Error('Employee not found.');

  const startDate = new Date(effectiveFrom);

  /* Close the previous active version for this employee. */
  const previous = await SalaryStructure.findOne({
    employee,
    isActive: true,
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: startDate } }],
  });

  if (previous) {
    previous.effectiveTo = new Date(startDate.getTime() - 1); /* day before new version starts */
    previous.isActive = false;
    await previous.save();
  }

  const structure = await SalaryStructure.create({
    employee,
    basic: basic || 0,
    hra: hra || 0,
    allowances: allowances || {},
    deductions: deductions || {},
    effectiveFrom: startDate,
    effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    isActive: isActive !== undefined ? isActive : true,
  });

  logAudit(req, {
    action: 'salary_structure.create_version',
    targetType: 'SalaryStructure',
    targetId: structure._id,
    description: `Created salary structure version for ${emp.employeeId} effective ${effectiveFrom}. Closed previous version: ${previous ? 'yes' : 'no'}.`,
  });

  return structure;
}

/**
 * Get the active salary structure for an employee on a given date.
 * @param {mongoose.Types.ObjectId} employeeId
 * @param {Date} onDate
 * @returns {Promise<SalaryStructure|null>}
 */
async function getActiveSalaryStructure(employeeId, onDate) {
  return SalaryStructure.findOne({
    employee: employeeId,
    isActive: true,
    effectiveFrom: { $lte: onDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: onDate } }],
  }).sort({ effectiveFrom: -1 });
}

/**
 * Check if any paid payrolls reference a given salary structure
 * (used to prevent modifications that would affect history).
 * @param {mongoose.Types.ObjectId} structureId
 * @returns {Promise<boolean>}
 */
async function isUsedByPaidPayroll(structureId) {
  const count = await Payroll.countDocuments({ salaryStructure: structureId, status: 'Paid' });
  return count > 0;
}

module.exports = { createSalaryStructureVersion, getActiveSalaryStructure, isUsedByPaidPayroll };
