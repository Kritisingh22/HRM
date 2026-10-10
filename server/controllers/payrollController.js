'use strict';
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const SalaryStructure = require('../models/SalaryStructure');
const Leave = require('../models/Leave');
const WorkCalendarPolicy = require('../models/WorkCalendarPolicy');
const { uploadToStorage, getSignedUrl } = require('../services/storage');
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
        accountNumber: employee.accountNumber || null,
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

  const workingDays = countWorkingDays(from, policy);
  const standardDays = workingDays; // Total working days in month

  const leaves = await getEmployeeLeaves(employee._id, from, to);
  let approvedLeaveDays = 0;
  let unpaidLeaveDays = 0;

  for (const leave of leaves) {
    const leaveFrom = new Date(Math.max(leave.from, from));
    const leaveTo = new Date(Math.min(leave.to, to));
    const leaveDays = countWorkingDays(leaveFrom, leave, policy) * (leave.halfDay ? 0.5 : 1);
    
    if (leave.type === 'Unpaid Leave') {
      unpaidLeaveDays += leaveDays;
    } else {
      approvedLeaveDays += leaveDays;
    }
  }

  const actualWorkingDays = standardDays - approvedLeaveDays - unpaidLeaveDays;
  const dailyRate = (salaryStructure.basic + salaryStructure.hra + 
    Object.values(salaryStructure.allowances || {}).reduce((a, b) => a + b, 0)) / standardDays;

  const gross = dailyRate * actualWorkingDays;
  
  // Calculate deductions
  const deductions = {
    pf: Math.min(gross * 0.12, 15000 * 0.12), // PF capped at 12% of 15000
    tds: 0, // Would be calculated based on tax slab
    esi: 0,
    other: 0,
  };

  // Add custom deductions
  for (const [key, value] of Object.entries(salaryStructure.deductions || {})) {
    if (deductions[key] !== undefined) {
      deductions[key] += value;
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
  const salaryStructure = await SalaryStructure.findOne({
    employee: employee,
    effectiveFrom: { $lte: new Date() },
    isActive: true,
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: new Date() } }],
  }).sort({ effectiveFrom: -1 });

  if (!salaryStructure) {
    throw ApiError.badRequest('No active salary structure found for this employee.');
  }

  // Get active calendar policy
  const policy = await getActivePolicyForDate(new Date());
  
  // Calculate payslip
  const calculation = await calculatePayslip(req.user, period, salaryStructure, policy);

  if (regenerate) {
    await Payroll.findOneAndDelete({ employee, period });
  }

  const payslip = await Payroll.create({
    employee: employee,
    salaryStructure: salaryStructure._id,
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

      const calculation = await calculatePayslip(req.user, period, salaryStructure, policy);

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

exports.generatePDF = catchAsync(async (req, res) => {
  const payslip = await Payroll.findById(req.params.id)
    .populate('employee', 'employeeId fullName email phone department designation manager employmentType location joiningDate bankName accountNumber ifsc accountHolderName')
    .populate('salaryStructure');

  if (!payslip) throw ApiError.notFound('Payslip not found.');

  if (!(await canReadPayrollOf(req.user, payslip.employee))) {
    throw ApiError.forbidden('You do not have permission to view this payslip.');
  }

  // Generate PDF using pdf-lib
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const employee = payslip.employee;
  const salary = payslip.salaryStructure || {};
  const payment = payslip.payment || {};

  // Helper to draw text
  const drawText = (text, x, y, size = 10, font = font, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y, size, font, color });
  };

  // Header
  drawText('CYETHACK', 50, height - 50, 24, boldFont, rgb(0.31, 0.6, 0.53));
  drawText('Payslip', 50, height - 80, 18, boldFont);
  drawText(`Period: ${payslip.period}`, width - 200, height - 50, 12, font);
  drawText(`Status: ${payslip.status}`, width - 200, height - 70, 12, font);

  // Employee Details
  let y = height - 130;
  drawText('Employee Details', 50, y, 14, boldFont);
  y -= 25;
  const empDetails = [
    ['Employee ID', employee.employeeId],
    ['Name', employee.fullName],
    ['Email', employee.email || '—'],
    ['Phone', employee.phone || '—'],
    ['Department', employee.department || '—'],
    ['Designation', employee.designation || '—'],
    ['Employment Type', employee.employmentType || 'Full-time'],
    ['Location', employee.location || '—'],
  ];
  for (const [label, value] of empDetails) {
    drawText(`${label}:`, 50, y, 10, boldFont);
    drawText(value, 200, y, 10);
    y -= 20;
  }

  // Earnings & Deductions
  y -= 10;
  drawText('Earnings & Deductions', 50, y, 14, boldFont);
  y -= 25;

  // Earnings
  drawText('Earnings', 50, y, 12, boldFont);
  y -= 20;
  const earnings = [
    ['Basic Salary', salary.basic || 0],
    ['HRA', salary.hra || 0],
    ...Object.entries(salary.allowances || {}).map(([k, v]) => [k, v]),
  ];
  let totalEarnings = 0;
  for (const [label, value] of earnings) {
    drawText(label, 50, y, 10);
    drawText(`₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 300, y, 10);
    totalEarnings += value;
    y -= 18;
  }
  drawText('Gross Earnings', 50, y, 10, boldFont);
  drawText(`₹${totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 300, y, 10, boldFont);
  y -= 30;

  // Deductions
  drawText('Deductions', 50, y, 12, boldFont);
  y -= 20;
  const deductions = payslip.deductions || {};
  let totalDeductions = 0;
  for (const [key, value] of Object.entries(deductions)) {
    drawText(key.toUpperCase(), 50, y, 10);
    drawText(`₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 300, y, 10);
    totalDeductions += value;
    y -= 18;
  }
  drawText('Total Deductions', 50, y, 10, boldFont);
  drawText(`₹${totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 300, y, 10, boldFont);
  y -= 30;

  // Net Pay
  drawText('Net Pay', 50, y, 14, boldFont, rgb(0.31, 0.6, 0.53));
  drawText(`₹${payslip.net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 300, y, 14, boldFont, rgb(0.31, 0.6, 0.53));
  y -= 40;

  // Payment Info
  drawText('Payment Details', 50, y, 12, boldFont);
  y -= 20;
  const paymentInfo = [
    ['Payment Status', payment.status || payslip.status],
    ['Payment Date', payment.date ? new Date(payment.date).toLocaleDateString('en-IN') : '—'],
    ['Mode', payment.mode || 'Bank Transfer'],
    ['Reference', payment.reference || '—'],
    ['Bank', employee.bankName || '—'],
    ['Account', employee.accountNumber ? '****' + employee.accountNumber.slice(-4) : '—'],
  ];
  for (const [label, value] of paymentInfo) {
    drawText(`${label}:`, 50, y, 10, boldFont);
    drawText(value, 200, y, 10);
    y -= 18;
  }

  // Footer
  y = 60;
  drawText('This is a system-generated payslip.', 50, y, 8, font, rgb(0.5, 0.5, 0.5));
  drawText(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 50, y - 15, 8, font, rgb(0.5, 0.5, 0.5));
  drawText('CYETHACK Solutions', width - 150, y, 8, font, rgb(0.5, 0.5, 0.5));

  const pdfBytes = await pdfDoc.save();
  
  // Store PDF in object storage
  const fileKey = `payslips/${payslip.employee.employeeId}/${payslip.period}.pdf`;
  await uploadToStorage(fileKey, Buffer.from(pdfBytes), 'application/pdf');
  
  // Update payslip with file key
  payslip.fileKey = fileKey;
  await payslip.save();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="payslip-${payslip.period}-${employee.employeeId}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

exports.downloadPDF = catchAsync(async (req, res) => {
  const payslip = await Payroll.findById(req.params.id)
    .populate('employee', 'employeeId fullName');

  if (!payslip) throw ApiError.notFound('Payslip not found.');
  if (!(await canReadPayrollOf(req.user, payslip.employee))) {
    throw ApiError.forbidden('You do not have permission to view this payslip.');
  }

  if (!payslip.fileKey) {
    // Generate on-demand if not exists
    return exports.generatePDF(req, res);
  }

  const signedUrl = await getSignedUrl(payslip.fileKey, 3600);
  res.redirect(signedUrl);
});