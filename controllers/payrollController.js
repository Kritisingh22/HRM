'use strict';
const mongoose = require('mongoose');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Document = require('../models/Document');
const SalaryStructure = require('../models/SalaryStructure');
const Leave = require('../models/Leave');
const WorkCalendarPolicy = require('../models/WorkCalendarPolicy');
const cfg = require('../config/env');
const { buildPayslipPdf, payslipFilename, maskAccount } = require('../services/payslipPdf');
const { putObject, removeObject } = require('../services/storage');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');

const MANAGEMENT_DEPTS = ['Project Management', 'Management'];
const HR_ROLES = ['ADMIN', 'SUPER_ADMIN'];

async function myEmployee(user) {
  return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] });
}

/* GET /api/payroll — scoped: own / team / HR-assigned / all (admin) */
exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (HR_ROLES.includes(req.user.role)) {
    filter = {};
  } else if (req.user.role === 'HR' || req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter = { employee: { $in: ids } };
  } else {
    const me = await myEmployee(req.user);
    filter = { employee: me ? me._id : null };
  }
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.period) filter.period = req.query.period;
  const payslips = await Payroll.find(filter)
    .populate('employee', 'employeeId fullName department designation')
    .sort({ period: -1 })
    .limit(500);
  res.json({ count: payslips.length, payroll: payslips });
});

/* GET /api/payroll/:id — object-level authorization */
exports.getOne = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id).populate(
    'employee',
    'employeeId fullName user department designation',
  );
  if (!slip) throw ApiError.notFound('Payslip not found.');
  if (!(await canReadPayrollOf(req.user, slip.employee))) {
    throw ApiError.forbidden('You do not have permission to view this payslip.');
  }
  res.json({ payslip: slip });
});

/* GET /api/payroll/:id/payslip — safe, print-ready projection */
exports.getPayslip = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id).populate(
    'employee',
    'employeeId fullName email phone department designation manager employmentType location joiningDate user bankName accountNumber ifsc accountHolderName',
  );
  if (!slip) throw ApiError.notFound('Payslip not found.');
  if (!(await canReadPayrollOf(req.user, slip.employee))) {
    throw ApiError.forbidden('You do not have permission to view this payslip.');
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
        mode: slip.paymentMode || 'Bank Transfer',
        transactionId: slip.transactionId || null,
        reference: slip.reference || null,
        utr: slip.utr || null,
        bankName: employee.bankName || null,
        accountNumber: maskAccount(employee.accountNumber),
        ifsc: employee.ifsc || null,
        accountHolderName: employee.accountHolderName || null,
        amount: slip.net,
        currency: 'INR',
      },
    },
  });
});

/* POST /api/payroll (payroll:write) */
exports.create = catchAsync(async (req, res) => {
  const { employee, period, gross } = req.body;
  if (!employee || !period)
    throw ApiError.badRequest('employee and period are required.');
  if (!(await canWritePayrollOf(req.user, employee))) {
    throw ApiError.forbidden('You are not authorized to create payroll for this employee.');
  }
  const slip = await Payroll.create({
    employee,
    period,
    gross: gross || 0,
    deductions: req.body.deductions || {},
    status: req.body.status || 'Draft',
  });
  logAudit(req, {
    action: 'payroll.create',
    targetType: 'Payroll',
    targetId: slip._id,
    description: `Created payslip ${period} (net ${slip.net}) for employee ${employee}`,
  });
  res.status(201).json({ payslip: slip });
});

/* PUT /api/payroll/:id (payroll:write) */
exports.update = catchAsync(async (req, res) => {
  const slip = await Payroll.findById(req.params.id);
  if (!slip) throw ApiError.notFound('Payslip not found.');
  if (!(await canWritePayrollOf(req.user, slip.employee))) {
    throw ApiError.forbidden('You are not authorized to update this payslip.');
  }
  const prevStatus = slip.status;
  ['gross', 'status', 'payDate'].forEach((k) => {
    if (req.body[k] !== undefined) slip[k] = req.body[k];
  });
  if (req.body.deductions !== undefined) {
    const current =
      slip.deductions && slip.deductions.toObject
        ? slip.deductions.toObject()
        : slip.deductions || {};
    slip.deductions = { ...current, ...req.body.deductions };
  }
  await slip.save();
  res.json({ payslip: slip });

  // Optional (flag-gated): archive the official PDF the moment HR moves the
  // payslip into "Processed". Runs after the response; failures are logged and
  // never surface as a payroll error. Never modifies the payroll record.
  if (cfg.PAYSLIP_ARCHIVE_TO_DRIVE && slip.status === 'Processed' && prevStatus !== 'Processed') {
    (async () => {
      try {
        const full = await loadAuthorizedPayslip(req);
        await archivePayslipFor(req, full);
      } catch (e) {
        console.error('[payroll] payslip auto-archive failed:', e.message);
      }
    })();
  }
});

async function canReadPayrollOf(user, employeeDoc) {
  if (!employeeDoc) return false;
  if (HR_ROLES.includes(user.role))
    return !['Project Management', 'Management'].includes(employeeDoc.department);
  if (user.role === 'HR' || user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return ids.some((id) => String(id) === String(employeeDoc._id));
  }
  const me = await myEmployee(user);
  return !!me && String(me._id) === String(employeeDoc._id);
}

async function canWritePayrollOf(user, employeeObjectId) {
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  const ids = await teamEmployeeIds(user);
  return ids.some((id) => String(id) === String(employeeObjectId));
}

function getActivePolicyForDate(date) {
  return WorkCalendarPolicy.findOne({
    isActive: true,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: date } }],
  }).sort({ effectiveFrom: -1 });
}

function isWorkingDay(date, policy) {
  if (!policy) return true; // Default to working day if no policy
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0) return false; // Sunday is always off
  if (dayOfWeek === 6) { // Saturday
    const dayOfMonth = date.getDate();
    const weekOfMonth = Math.ceil(dayOfMonth / 7);
    if (policy.oddSaturdaysOff) {
      return weekOfMonth % 2 === 0; // Even weeks (2nd, 4th) are working
    }
    return false;
  }
  return true;
}

function countWorkingDays(from, to, policy) {
  let count = 0;
  const current = new Date(from);
  const end = new Date(to);
  while (current <= end) {
    if (isWorkingDay(current, policy)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

async function getEmployeeLeaves(employeeId, from, to) {
  return Leave.aggregate([
    { $match: { employee: employeeId, status: 'Approved', from: { $lte: to }, to: { $gte: from } } },
    { $project: { from: 1, to: 1, days: 1, halfDay: 1 } },
  ]);
}

async function calculatePayslip(employee, period, salaryStructure, policy) {
  const [year, month] = period.split('-').map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0); // Last day of month

  const workingDays = countWorkingDays(from, to, policy);
  const standardDays = workingDays; // Total working days in month

  const leaves = await getEmployeeLeaves(employee._id, from, to);
  let approvedLeaveDays = 0;
  let unpaidLeaveDays = 0;

  for (const leave of leaves) {
    const leaveFrom = new Date(Math.max(leave.from, from));
    const leaveTo = new Date(Math.min(leave.to, to));
    const leaveDays = countWorkingDays(leaveFrom, leaveTo, policy) * (leave.halfDay ? 0.5 : 1);
    
    if (leave.type === 'Unpaid Leave') {
      unpaidLeaveDays += leaveDays;
    } else {
      approvedLeaveDays += leaveDays;
    }
  }

  const actualWorkingDays = standardDays - approvedLeaveDays - unpaidLeaveDays;
  /* `allowances`/`deductions` are Mongoose Maps — Object.values() on a Map
     is empty, so unwrap them first or every structure amount reads 0. */
  const allowances =
    salaryStructure.allowances instanceof Map
      ? Object.fromEntries(salaryStructure.allowances)
      : salaryStructure.allowances || {};
  const dailyRate = (salaryStructure.basic + salaryStructure.hra + 
    Object.values(allowances).reduce((a, b) => a + Number(b || 0), 0)) / standardDays;

  const gross = dailyRate * actualWorkingDays;
  
  // Calculate deductions
  const deductions = {
    pf: Math.min(gross * 0.12, 15000 * 0.12), // PF capped at 12% of 15000
    tds: 0, // Would be calculated based on tax slab
    esi: 0,
    other: 0,
  };

  // Add custom deductions
  const structureDeductions =
    salaryStructure.deductions instanceof Map
      ? Object.fromEntries(salaryStructure.deductions)
      : salaryStructure.deductions || {};
  for (const [key, value] of Object.entries(structureDeductions)) {
    if (deductions[key] !== undefined) {
      deductions[key] += Number(value || 0);
    }
  }

  const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
  const net = Math.max(0, gross - totalDeductions);

  return {
    gross: Math.round(gross),
    net: Math.round(net),
    deductions,
    workingDays: actualWorkingDays,
    standardDays,
    approvedLeaveDays,
    unpaidLeaveDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
  };
}

exports.generatePayslip = catchAsync(async (req, res) => {
  const { employee, period, regenerate } = req.body;
  if (!employee || !period) throw ApiError.badRequest('employee and period are required.');

  if (!userHasPermission(req.user, 'payroll:write')) {
    throw ApiError.forbidden('You do not have permission to generate payslips.');
  }

  const employeeDoc = await Employee.findById(employee);
  if (!employeeDoc) throw ApiError.notFound('Employee not found.');

  if (!(await canWritePayrollOf(req.user, employeeDoc._id))) {
    throw ApiError.forbidden('You are not authorized to generate payroll for this employee.');
  }

  // Check if payslip already exists
  const existing = await Payroll.findOne({ employee: employee, period });
  if (existing && !regenerate) {
    throw ApiError.conflict('Payslip for this period already exists. Use regenerate=true to overwrite.');
  }

  // Get salary structure
  let salaryStructure = await SalaryStructure.findOne({
    employee: employee,
    effectiveFrom: { $lte: new Date() },
    isActive: true,
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: new Date() } }],
  }).sort({ effectiveFrom: -1 });

  // Fallback: create a default salary structure from employee's salary field if none exists
  let salaryStructureId;
  let calculation;
  if (!salaryStructure) {
    if (!employeeDoc.salary || employeeDoc.salary <= 0) {
      throw ApiError.badRequest('No active salary structure found and employee has no base salary.');
    }
    // Create a default salary structure from employee's base salary
    // Assume 50% basic, 30% HRA, 20% allowances; standard deductions
    const baseSalary = employeeDoc.salary;
    const basic = Math.round(baseSalary * 0.5);
    const hra = Math.round(baseSalary * 0.3);
    const allowances = { transport: Math.round(baseSalary * 0.1), medical: Math.round(baseSalary * 0.1) };
    const deductions = {
      pf: Math.min(Math.round(baseSalary * 0.12), 1800),
      tds: 0,
      esi: 0,
      other: 0,
    };
    // Calculate using the same logic as calculatePayslip but with default structure
    const policy = await getActivePolicyForDate(new Date());
    const standardDays = 26; // Standard working days per month
    const dailyRate = baseSalary / standardDays;
    
    // Get leave days for the period
    const [year, month] = period.split('-').map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0);
    const leaves = await Leave.aggregate([
      { $match: { employee: employeeDoc._id, status: 'Approved', from: { $lte: to }, to: { $gte: from } } },
      { $project: { from: 1, to: 1, days: 1, halfDay: 1 } },
    ]);
    let approvedLeaveDays = 0;
    let unpaidLeaveDays = 0;
    for (const leave of leaves) {
      const leaveFrom = new Date(Math.max(new Date(leave.from), from));
      const leaveTo = new Date(Math.min(new Date(leave.to), to));
      const leaveDays = countWorkingDays(leaveFrom, leaveTo, policy) * (leave.halfDay ? 0.5 : 1);
      if (leave.type === 'Unpaid Leave') {
        unpaidLeaveDays += leaveDays;
      } else {
        approvedLeaveDays += leaveDays;
      }
    }
    const actualWorkingDays = standardDays - approvedLeaveDays - unpaidLeaveDays;
    const gross = Math.round(dailyRate * actualWorkingDays);
    const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
    const net = Math.max(0, gross - totalDeductions);

    calculation = {
      gross,
      net,
      deductions,
      workingDays: actualWorkingDays,
      standardDays,
      approvedLeaveDays,
      unpaidLeaveDays,
      dailyRate: Math.round(dailyRate * 100) / 100,
    };
    salaryStructureId = null; // No SalaryStructure document
  } else {
    salaryStructureId = salaryStructure._id;
    // Get active calendar policy
    const policy = await getActivePolicyForDate(new Date());
    
    // Calculate payslip
    calculation = await calculatePayslip(employeeDoc, period, salaryStructure, policy);
  }

  if (regenerate) {
    await Payroll.findOneAndDelete({ employee, period });
  }

  const payslip = await Payroll.create({
    employee: employee,
    salaryStructure: salaryStructureId,
    period,
    gross: calculation.gross,
    deductions: calculation.deductions,
    net: calculation.net,
    status: 'Draft',
  });

  logAudit(req, {
    action: 'payroll.generate',
    targetType: 'Payroll',
    targetId: payslip._id,
    description: `Generated payslip for ${period} (net: ${calculation.net})`,
  });

  res.status(201).json({ payslip, calculation });
});

exports.bulkGenerate = catchAsync(async (req, res) => {
  const { period, employeeIds } = req.body;
  if (!period) throw ApiError.badRequest('period is required.');

  if (!userHasPermission(req.user, 'payroll:write')) {
    throw ApiError.forbidden('You do not have permission to generate payslips.');
  }

  let filter = { status: 'Active' };
  if (employeeIds && employeeIds.length > 0) {
    filter._id = { $in: employeeIds };
  } else {
    // Scope to user's team
    const ids = await teamEmployeeIds(req.user);
    filter._id = { $in: ids };
  }

  const employees = await Employee.find(filter).select('_id');
  const policy = await getActivePolicyForDate(new Date());

  const results = { created: 0, skipped: 0, errors: [] };

  for (const emp of employees) {
    try {
      const existing = await Payroll.findOne({ employee: emp._id, period });
      if (existing) {
        results.skipped++;
        continue;
      }

      const salaryStructure = await SalaryStructure.findOne({
        employee: emp._id,
        effectiveFrom: { $lte: new Date() },
        isActive: true,
        $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: new Date() } }],
      }).sort({ effectiveFrom: -1 });

      if (!salaryStructure) {
        results.errors.push({ employee: emp._id, error: 'No active salary structure' });
        continue;
      }

      const calculation = await calculatePayslip(emp, period, salaryStructure, policy);

      await Payroll.create({
        employee: emp._id,
        salaryStructure: salaryStructure._id,
        period,
        gross: calculation.gross,
        deductions: calculation.deductions,
        net: calculation.net,
        status: 'Draft',
      });

      results.created++;
    } catch (err) {
      results.errors.push({ employee: emp._id, error: err.message });
    }
  }

  logAudit(req, {
    action: 'payroll.bulkGenerate',
    targetType: 'Payroll',
    description: `Bulk generated payslips for ${period}: ${results.created} created, ${results.skipped} skipped`,
  });

  res.json({ results });
});

exports.approve = catchAsync(async (req, res) => {
  const payslip = await Payroll.findById(req.params.id);
  if (!payslip) throw ApiError.notFound('Payslip not found.');

  if (!(await canWritePayrollOf(req.user, payslip.employee))) {
    throw ApiError.forbidden('You are not authorized to approve this payslip.');
  }

  if (payslip.status !== 'Draft') {
    throw ApiError.badRequest('Only draft payslips can be approved.');
  }

  payslip.status = 'Approved';
  await payslip.save();

  logAudit(req, { action: 'payroll.approve', targetType: 'Payroll', targetId: payslip._id, description: `Approved payslip ${payslip.period}` });
  res.json({ payslip });
});

/* ---------------------------------------------------------------------------
   Payslip PDF (professional, invoice-style document)

   The PDF is generated on the server from the authorized MongoDB record and
   streamed back directly — it is never written to disk/storage and the payroll
   document is never modified. Authorization reuses the same object-level rules
   as every other payslip read:
     - EMPLOYEE        → own payslips only
     - HR / MANAGER    → their existing team / assigned-employee scope
     - ADMIN / SUPER_ADMIN → all except Management/Project-Management salaries
   --------------------------------------------------------------------------- */

/** Optional company profile for the PDF header — only configured values are shown. */
function companyProfile() {
  return {
    name: cfg.COMPANY_NAME,
    address: cfg.COMPANY_ADDRESS,
    email: cfg.COMPANY_EMAIL,
    phone: cfg.COMPANY_PHONE,
    website: cfg.COMPANY_WEBSITE
  };
}

/** Load a payslip + its employee (safe fields only) and enforce read access. */
async function loadAuthorizedPayslip(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid payslip id.');
  }
  const slip = await Payroll.findById(id)
    .populate(
      'employee',
      'employeeId fullName department designation employmentType location joiningDate bankName accountNumber',
    )
    .populate('salaryStructure');
  if (!slip) throw ApiError.notFound('Payslip not found.');
  if (!(await canReadPayrollOf(req.user, slip.employee))) {
    throw ApiError.forbidden('You do not have permission to view this payslip.');
  }
  // Prefer the record's own linked structure; otherwise use the employee's
  // currently active structure. The renderer only shows its components when
  // they reconcile with the recorded gross — never invented figures.
  if (!slip.salaryStructure && slip.employee) {
    slip.salaryStructure = await SalaryStructure.findOne({
      employee: slip.employee._id,
      isActive: true,
    }).sort({ effectiveFrom: -1 });
  }
  return slip;
}

/** Stream the generated PDF with safe headers (inline or attachment). */
function sendPayslipPdf(res, bytes, filename, { download = false } = {}) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 500 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Payslip PDF generation returned an invalid or empty document.');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
  );
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

/* GET /api/payroll/:id/payslip/pdf — official payslip PDF (inline).
 * Add ?download=1 to force the attachment / save dialog. */
exports.payslipPdf = catchAsync(async (req, res) => {
  const slip = await loadAuthorizedPayslip(req);
  try {
    const bytes = await buildPayslipPdf({
      payroll: slip,
      employee: slip.employee,
      salaryStructure: slip.salaryStructure,
      company: companyProfile(),
      currency: cfg.PAYROLL_CURRENCY,
    });
    sendPayslipPdf(res, bytes, payslipFilename(slip.employee.employeeId, slip.period), {
      download: req.query.download !== '0'
    });
  } catch (err) {
    console.error('[payroll] Payslip PDF generation failed:', err.message);
    throw ApiError.internal('Failed to generate payslip PDF. Please try again or contact HR.');
  }
});

/* GET /api/payroll/:id/download — the same official PDF as an attachment. */
exports.downloadPDF = catchAsync(async (req, res) => {
  const slip = await loadAuthorizedPayslip(req);
  let bytes;
  try {
    bytes = await buildPayslipPdf({
      payroll: slip,
      employee: slip.employee,
      salaryStructure: slip.salaryStructure,
      company: companyProfile(),
      currency: cfg.PAYROLL_CURRENCY,
    });
  } catch (err) {
    console.error('[payroll] Payslip PDF generation failed:', err.message);
    throw ApiError.internal('Failed to generate payslip PDF. Please try again or contact HR.');
  }
  
  // Archive the payslip automatically on download (includes Google Drive upload if configured)
  try {
    const { archivePayslip } = require('../services/payslipArchive');
    await archivePayslip(slip._id, req.user._id, req.user.role, {
      uploadToDrive: true,
      skipDriveOnFailure: true // Don't fail the download if Drive upload fails
    });
  } catch (archiveError) {
    console.error('[payroll] Archive failed during download:', archiveError.message);
    // Continue with download even if archiving fails
  }
  
  sendPayslipPdf(res, bytes, payslipFilename(slip.employee.employeeId, slip.period), {
    download: true
  });
});

/* ---------------- payslip archive (object storage) ---------------- */

/** Generate + store the payslip PDF as a private, retained Document. */
async function archivePayslipFor(req, slip) {
  const filename = payslipFilename(slip.employee.employeeId, slip.period);
  // Idempotent: reuse an existing active archive for this payslip.
  const existing = await Document.findOne({
    relatedModel: 'Payroll',
    relatedId: slip._id,
    uploadStatus: 'active',
  }).select('_id');
  if (existing) return { existing: true, documentId: existing._id };

  const bytes = await buildPayslipPdf({
    payroll: slip,
    employee: slip.employee,
    salaryStructure: slip.salaryStructure,
    company: companyProfile(),
    currency: cfg.PAYROLL_CURRENCY,
  });
  const buffer = Buffer.from(bytes);
  const docId = new mongoose.Types.ObjectId();
  const put = await putObject({
    key: `payslips/${slip.employee.employeeId}/${filename}`,
    buffer,
    contentType: 'application/pdf',
    originalName: filename,
    appProperties: {
      documentId: String(docId),
      payrollId: String(slip._id),
      employeeId: String(slip.employee._id),
    },
  });

  try {
    const document = await Document.create({
      _id: docId,
      title: filename,
      employee: slip.employee._id,
      owner: slip.employee._id,
      scope: 'personal',
      type: `Payslip ${slip.period}`,
      category: 'payslip',
      storageKey: put.key,
      storageProvider: put.provider,
      checksum: put.checksum,
      retention: 'retain',
      originalName: filename,
      mimeType: 'application/pdf',
      size: put.size,
      uploadedBy: req.user._id,
      uploaderRole: req.user.role,
      visibility: 'private',
      relatedModel: 'Payroll',
      relatedId: slip._id,
    });
    return { existing: false, document };
  } catch (e) {
    await removeObject({ provider: put.provider, key: put.key }).catch(() => {});
    throw e;
  }
}

/* POST /api/payroll/:id/payslip/archive — file the generated payslip PDF into
 * object storage (payroll:write + object scope). The employee keeps using the
 * regular payslip endpoint; HR/Manager reach the archive through the
 * employee-documents endpoints. 409 when the payslip is already archived. */
exports.archivePayslipPdf = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'payroll:write')) {
    throw ApiError.forbidden('You do not have permission to archive payslips.');
  }
  const slip = await loadAuthorizedPayslip(req);
  if (!(await canWritePayrollOf(req.user, slip.employee._id))) {
    throw ApiError.forbidden('You are not authorized to archive this payslip.');
  }

  const result = await archivePayslipFor(req, slip);
  if (result.existing) {
    return res.status(409).json({
      error: 'This payslip is already archived.',
      existingId: String(result.documentId),
    });
  }

  logAudit(req, {
    action: 'payslip.archive',
    targetType: 'Payroll',
    targetId: slip._id,
    description: `Archived payslip PDF for ${slip.employee.employeeId} ${slip.period} via ${result.document.storageProvider}`,
  });

  return res.status(201).json({ document: result.document });
});

// Alias for route compatibility
exports.generate = exports.generatePayslip;

// Get archive status for a payslip (including Google Drive sync status)
exports.getArchiveStatus = catchAsync(async (req, res) => {
  const { getArchiveStatus } = require('../services/payslipArchive');
  const status = await getArchiveStatus(req.params.id);
  res.json(status);
});

// Retry failed R2 upload for a payslip
exports.retryDriveUpload = catchAsync(async (req, res) => {
  const { retryR2Upload } = require('../services/payslipArchive');
  const result = await retryR2Upload(req.params.id, req.user._id, req.user.role);
  res.json(result);
});

// Alias for route compatibility
exports.generate = exports.generatePayslip;

// Generate payslip for a specific employee (employeeId from params)
exports.generateForEmployee = catchAsync(async (req, res) => {
  // Find employee by employeeId (string like CY0525RS109) not _id
  const employeeDoc = await Employee.findOne({ employeeId: req.params.employeeId });
  if (!employeeDoc) throw ApiError.notFound('Employee not found.');
  
  // Check permission for this employee
  if (!(await canWritePayrollOf(req.user, employeeDoc._id))) {
    throw ApiError.forbidden('You are not authorized to generate payroll for this employee.');
  }
  
  // Call generatePayslip with the employee's _id
  req.body.employee = employeeDoc._id;
  return exports.generatePayslip(req, res);
});

module.exports = exports;