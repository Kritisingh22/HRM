/* ============================================================
   Payroll Service — idempotent payroll runs with paid immutability.

   • Unique (employee, period) index prevents duplicates.
   • Paid payrolls are immutable — no field changes after status='Paid'.
   • Re-run before approval recalculates from salary structure +
     weekly attendance summary + leave + work calendar policy.
   * All writes in a transaction when multiple collections are touched.
   ============================================================ */

const mongoose = require('mongoose');
const Payroll = require('../models/Payroll');
const SalaryStructure = require('../models/SalaryStructure');
const WeeklyAttendanceSummary = require('../models/WeeklyAttendanceSummary');
const Leave = require('../models/Leave');
const WorkCalendarPolicy = require('../models/WorkCalendarPolicy');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { createNotification } = require('./notificationService');
const { logAudit } = require('../utils/audit');

/**
 * Compute payroll amounts for an employee for a given month.
 * Uses salary structure + weekly attendance + leave + calendar policy.
 * @param {Object} employee - Employee document
 * @param {string} period - 'YYYY-MM'
 * @param {Object} [settings] - optional work calendar policy
 * @returns {Promise<{gross, deductions, net, workingDays, presentDays, leaveDays}>}
 */
async function computePayroll(employee, period, settings) {
  const [year, month] = period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  /* Get the active salary structure for this period. */
  const salaryStructure = await SalaryStructure.findOne({
    employee: employee._id,
    isActive: true,
    effectiveFrom: { $lte: endDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: startDate } }],
  }).sort({ effectiveFrom: -1 });

  const basic = salaryStructure ? (salaryStructure.basic || 0) : 0;
  const hra = salaryStructure ? (salaryStructure.hra || 0) : 0;
  const allowances = salaryStructure ? Object.values(salaryStructure.allowances || {}).reduce((a, b) => a + b, 0) : 0;
  const structureDeductions = salaryStructure ? Object.values(salaryStructure.deductions || {}).reduce((a, b) => a + b, 0) : 0;

  /* Get weekly attendance summaries for this month. */
  const summaries = await WeeklyAttendanceSummary.find({
    employee: employee._id,
    weekStart: { $gte: startDate, $lte: endDate },
  });

  const totalWorkingSeconds = summaries.reduce((sum, s) => sum + (s.totalWorkingSeconds || 0), 0);
  const workingHours = totalWorkingSeconds / 3600;

  /* Get approved leaves for this month. */
  const leaves = await Leave.find({
    employee: employee._id,
    status: 'Approved',
    from: { $lte: endDate },
    to: { $gte: startDate },
  });
  const leaveDays = leaves.reduce((sum, l) => sum + (l.days || 0), 0);

  /* Standard work days from calendar policy. */
  const standardHoursPerDay = settings?.standardHoursPerDay || 8;
  const workingDaysPerWeek = settings?.workingDaysPerWeek || 5;

  /* Simple pro-rata: gross = basic + hra + allowances, adjusted by attendance. */
  const attendanceRatio = workingHours > 0 ? Math.min(1, workingHours / (standardHoursPerDay * 22)) : 0; /* 22 work days/month */
  const gross = Math.max(0, (basic + hra + allowances) * attendanceRatio);

  /* Deductions: PF (12% of basic), TDS (estimated), ESI, other. */
  const pf = Math.max(0, basic * 0.12);
  const esi = Math.max(0, gross * 0.0075); /* 0.75% employee contribution */
  const tds = 0; /* computed by tax rules, placeholder */
  const otherDeductions = structureDeductions;
  const totalDeductions = pf + tds + esi + otherDeductions;

  const net = Math.max(0, gross - totalDeductions);

  return {
    gross: Math.round(gross * 100) / 100,
    deductions: { pf: Math.round(pf * 100) / 100, tds, esi: Math.round(esi * 100) / 100, other: Math.round(otherDeductions * 100) / 100 },
    net: Math.round(net * 100) / 100,
    workingDays: Math.round(workingHours / standardHoursPerDay),
    presentDays: Math.round(workingHours / standardHoursPerDay),
    leaveDays,
  };
}

/**
 * Run payroll for all employees for a given month. Idempotent —
 * re-running for the same month updates existing drafts, never duplicates.
 * @param {string} period - 'YYYY-MM'
 * @param {Object} actor - Express req.user (must be HR/Admin)
 * @param {Object} req - Express request
 * @returns {Promise<{created: number, updated: number, skipped: number}>}
 */
async function runPayroll(period, actor, req) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const employees = await Employee.find({ status: { $in: ['Active', 'Probation', 'On Leave'] } }).session(session);
    const policy = await WorkCalendarPolicy.findOne({ isActive: true }).session(session);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const emp of employees) {
      const existing = await Payroll.findOne({ employee: emp._id, period }).session(session);

      const calc = await computePayroll(emp, period, policy);

      if (existing) {
        /* Only recalculate if still in Draft (immutability). */
        if (existing.status === 'Paid' || existing.status === 'Processed') {
          skipped++;
          continue;
        }
        existing.gross = calc.gross;
        existing.deductions = calc.deductions;
        existing.net = calc.net;
        existing.status = 'Draft';
        await existing.save({ session });
        updated++;
      } else {
        await Payroll.create([{
          employee: emp._id,
          period,
          gross: calc.gross,
          deductions: calc.deductions,
          net: calc.net,
          status: 'Draft',
        }], { session });
        created++;
      }
    }

    await session.commitTransaction();

    logAudit(req, {
      action: 'payroll.run',
      targetType: 'Payroll',
      targetId: period,
      description: `Payroll run for ${period}: ${created} created, ${updated} updated, ${skipped} skipped (paid/processed).`,
    });

    return { created, updated, skipped };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Approve a payroll record. Only Draft can be approved.
 * @param {string|ObjectId} payrollId
 * @param {Object} actor
 * @param {Object} req
 * @returns {Promise<Payroll>}
 */
async function approvePayroll(payrollId, actor, req) {
  const payroll = await Payroll.findById(payrollId);
  if (!payroll) throw new Error('Payroll not found.');
  if (payroll.status === 'Paid' || payroll.status === 'Processed') throw new Error('Cannot approve a paid/processed payroll.');
  if (payroll.status !== 'Draft') throw new Error(`Cannot approve payroll in status ${payroll.status}.`);

  payroll.status = 'Approved';
  await payroll.save();

  /* Notify the employee. */
  const employee = await Employee.findById(payroll.employee).select('user fullName employeeId');
  if (employee && employee.user) {
    await createNotification({
      user: employee.user,
      type: 'payroll.approved',
      title: `Payslip Approved — ${payroll.period}`,
      message: `Your payslip for ${payroll.period} has been approved. Net pay: ₹${payroll.net.toLocaleString('en-IN')}.`,
      relatedEntity: { type: 'Payroll', id: payroll._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  logAudit(req, {
    action: 'payroll.approve',
    targetType: 'Payroll',
    targetId: payroll._id,
    description: `Approved payroll for ${employee ? employee.employeeId : 'unknown'} (${payroll.period}) — net ₹${payroll.net}.`,
  });

  return payroll;
}

/**
 * Mark a payroll as paid. Immutable after this.
 * @param {string|ObjectId} payrollId
 * @param {Object} actor
 * @param {Object} req
 * @param {Object} paymentInfo - { payDate, paymentMode, transactionId, reference, utr }
 * @returns {Promise<Payroll>}
 */
async function markPayrollPaid(payrollId, actor, req, paymentInfo) {
  const payroll = await Payroll.findById(payrollId);
  if (!payroll) throw new Error('Payroll not found.');
  if (payroll.status === 'Paid') throw new Error('Payroll already paid.');
  if (payroll.status !== 'Approved' && payroll.status !== 'Processed') throw new Error(`Cannot mark payroll as paid from status ${payroll.status}.`);

  payroll.status = 'Paid';
  payroll.payDate = paymentInfo?.payDate || new Date();
  if (paymentInfo?.paymentMode) payroll.paymentMode = paymentInfo.paymentMode;
  if (paymentInfo?.transactionId) payroll.transactionId = paymentInfo.transactionId;
  if (paymentInfo?.reference) payroll.reference = paymentInfo.reference;
  if (paymentInfo?.utr) payroll.utr = paymentInfo.utr;
  await payroll.save();

  /* Notify the employee. */
  const employee = await Employee.findById(payroll.employee).select('user fullName employeeId');
  if (employee && employee.user) {
    await createNotification({
      user: employee.user,
      type: 'payroll.paid',
      title: `Salary Paid — ${payroll.period}`,
      message: `Your salary for ${payroll.period} (₹${payroll.net.toLocaleString('en-IN')}) has been paid on ${payroll.payDate.toLocaleDateString('en-IN')}.`,
      relatedEntity: { type: 'Payroll', id: payroll._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  logAudit(req, {
    action: 'payroll.paid',
    targetType: 'Payroll',
    targetId: payroll._id,
    description: `Marked payroll as paid for ${employee ? employee.employeeId : 'unknown'} (${payroll.period}) — net ₹${payroll.net}.`,
  });

  return payroll;
}

module.exports = { computePayroll, runPayroll, approvePayroll, markPayrollPaid };
