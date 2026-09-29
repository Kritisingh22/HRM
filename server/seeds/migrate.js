/* Migration script — replace dummy/test data with real CYTHACK Solution employees.
 * Run with: node server/seeds/migrate.js
 * This script:
 * 1. Identifies and removes dummy/test records
 * 2. Creates real employee records with properly hashed passwords
 * 3. Preserves existing genuine company data (if any)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cfg = require('../config/env');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const Hiring = require('../models/Hiring');
const RefreshToken = require('../models/RefreshToken');
const Performance = require('../models/Performance');
const Project = require('../models/Project');
const Document = require('../models/Document');
const Notice = require('../models/Notice');
const Ticket = require('../models/Ticket');
const Offboarding = require('../models/Offboarding');

// Dummy emails to identify test records
const DUMMY_EMAILS = [
  'dummy.superadmin@example.com',
  'dummy.admin@example.com',
  'dummy.hr@example.com',
  'dummy.manager@example.com',
  'dummy.employee@example.com'
];

// Dummy employee IDs to identify test records
const DUMMY_EMPLOYEE_IDS = [
  'DUMMY-MGR-001',
  'DUMMY-EMP-001'
];

// Real CYTHACK Solution employees
const REAL_EMPLOYEES = [
  {
    employeeId: 'CY0125JS201',
    fullName: 'Jaya Sahu',
    email: 'jaya.sahu@cyethack.com',
    department: 'Human Resources',
    designation: 'HR',
    manager: null,
    location: 'Work from Home',
    salary: 95000,
    status: 'Active',
    joiningDate: '2025-01-06',
    role: 'HR',
    password: 'JayaCY0125JS201',
    bankName: 'HDFC Bank',
    accountNumber: '50100123456789',
    ifsc: 'HDFC0001234',
    accountHolderName: 'Jaya Sahu'
  },
  {
    employeeId: 'CY0824SD301',
    fullName: 'Surya Dev Diwedi',
    email: 'surya.dwivedi@cyethack.com',
    department: 'Project Management',
    designation: 'Project Manager',
    manager: null,
    location: 'Work from Home',
    salary: 120000,
    status: 'Active',
    joiningDate: '2024-01-08',
    role: 'MANAGER',
    password: 'SuryCY0824SD301',
    bankName: 'ICICI Bank',
    accountNumber: '012301543210',
    ifsc: 'ICIC0000123',
    accountHolderName: 'Surya Dev Diwedi'
  },
  {
    employeeId: 'CY0525RS109',
    fullName: 'Gangarapu Rohith Sai Ganesh',
    email: 'rohith.sai@cyethack.com',
    department: 'Engineering',
    designation: 'Django Developer',
    manager: 'CY0824SD301',
    location: 'Client site',
    salary: 75000,
    status: 'Active',
    joiningDate: '2025-11-05',
    role: 'EMPLOYEE',
    password: 'GangCY0525RS109',
    bankName: 'State Bank of India',
    accountNumber: '32456789012',
    ifsc: 'SBIN0001234',
    accountHolderName: 'Gangarapu Rohith Sai Ganesh'
  },
  {
    employeeId: 'CY0226AR110',
    fullName: 'Athul Rajagopalan P',
    email: 'athul.raja@cyethack.com',
    department: 'Engineering',
    designation: 'Django Developer',
    manager: 'CY0824SD301',
    location: 'Client site',
    salary: 75000,
    status: 'Active',
    joiningDate: '2026-02-02',
    role: 'EMPLOYEE',
    password: 'AthuCY0226AR110',
    bankName: 'Axis Bank',
    accountNumber: '917010012345678',
    ifsc: 'UTIB0001234',
    accountHolderName: 'Athul Rajagopalan P'
  },
  {
    employeeId: 'CY0626AD111',
    fullName: 'Aman Dange',
    email: 'aman.dange@cyethack.com',
    department: 'Engineering',
    designation: 'Django Developer',
    manager: 'CY0824SD301',
    location: 'Client site',
    salary: 75000,
    status: 'Active',
    joiningDate: '2026-01-06',
    role: 'EMPLOYEE',
    password: 'AmanCY0626AD111',
    bankName: 'Kotak Mahindra Bank',
    accountNumber: '2311234567',
    ifsc: 'KKBK0001234',
    accountHolderName: 'Aman Dange'
  },
  {
    employeeId: 'CY0726SS112',
    fullName: 'Sanal Sabu',
    email: 'sanal.sabu@cyethack.com',
    department: 'Engineering',
    designation: 'Django Developer',
    manager: 'CY0824SD301',
    location: 'Client site',
    salary: 75000,
    status: 'Active',
    joiningDate: '2026-07-25',
    role: 'EMPLOYEE',
    password: 'SanaCY0726SS112',
    bankName: 'Punjab National Bank',
    accountNumber: '0123000100123456',
    ifsc: 'PUNB0001234',
    accountHolderName: 'Sanal Sabu'
  }
];

async function connectDB() {
  await mongoose.connect(cfg.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected:', mongoose.connection.host + '/' + mongoose.connection.name);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

async function findDummyRecords() {
  console.log('\n=== Identifying Dummy Records ===\n');

  // Find dummy users
  const dummyUsers = await User.find({
    $or: [
      { email: { $in: DUMMY_EMAILS } },
      { employeeId: { $in: DUMMY_EMPLOYEE_IDS } }
    ]
  }).select('email employeeId role fullName');

  console.log('Dummy Users found:');
  if (dummyUsers.length === 0) {
    console.log('  (none)');
  } else {
    dummyUsers.forEach(u => console.log(`  - ${u.email} (${u.role}) ${u.employeeId ? `[${u.employeeId}]` : ''} - ${u.fullName}`));
  }

  // Find dummy employees
  const dummyEmployees = await Employee.find({
    employeeId: { $in: DUMMY_EMPLOYEE_IDS }
  }).select('employeeId fullName email department');

  console.log('\nDummy Employees found:');
  if (dummyEmployees.length === 0) {
    console.log('  (none)');
  } else {
    dummyEmployees.forEach(e => console.log(`  - ${e.employeeId} - ${e.fullName} (${e.email})`));
  }

  // Find any existing real employees that might conflict
  const realEmployeeIds = REAL_EMPLOYEES.map(e => e.employeeId);
  const existingRealEmployees = await Employee.find({
    employeeId: { $in: realEmployeeIds }
  }).select('employeeId fullName email');

  console.log('\nExisting Real Employees (will be skipped):');
  if (existingRealEmployees.length === 0) {
    console.log('  (none)');
  } else {
    existingRealEmployees.forEach(e => console.log(`  - ${e.employeeId} - ${e.fullName} (${e.email})`));
  }

  // Find existing real users that might conflict
  const existingRealUsers = await User.find({
    employeeId: { $in: realEmployeeIds }
  }).select('employeeId email role');

  console.log('\nExisting Real Users (will be skipped):');
  if (existingRealUsers.length === 0) {
    console.log('  (none)');
  } else {
    existingRealUsers.forEach(u => console.log(`  - ${u.employeeId} - ${u.email} (${u.role})`));
  }

  return { dummyUsers, dummyEmployees, existingRealEmployees, existingRealUsers };
}

async function deleteDummyRecords(dummyUsers, dummyEmployees) {
  console.log('\n=== Deleting Dummy Records ===\n');

  const dummyUserIds = dummyUsers.map(u => u._id);
  const dummyEmpIds = dummyEmployees.map(e => e._id);

  // Delete related records first (to avoid orphaned references)
  if (dummyUserIds.length > 0) {
    await RefreshToken.deleteMany({ user: { $in: dummyUserIds } });
    console.log(`Deleted refresh tokens for ${dummyUserIds.length} dummy users`);
  }

  if (dummyEmpIds.length > 0) {
    await Leave.deleteMany({ employee: { $in: dummyEmpIds } });
    await Attendance.deleteMany({ employee: { $in: dummyEmpIds } });
    await Payroll.deleteMany({ employee: { $in: dummyEmpIds } });
    await Performance.deleteMany({ employee: { $in: dummyEmpIds } });
    await Document.deleteMany({ employee: { $in: dummyEmpIds } });
    await Offboarding.deleteMany({ employee: { $in: dummyEmpIds } });
    await Project.updateMany(
      { members: { $in: dummyEmpIds } },
      { $pull: { members: { $in: dummyEmpIds } } }
    );
    console.log(`Deleted related records for ${dummyEmpIds.length} dummy employees`);
  }

  // Delete dummy users
  if (dummyUserIds.length > 0) {
    await User.deleteMany({ _id: { $in: dummyUserIds } });
    console.log(`Deleted ${dummyUserIds.length} dummy users`);
  }

  // Delete dummy employees
  if (dummyEmpIds.length > 0) {
    await Employee.deleteMany({ _id: { $in: dummyEmpIds } });
    console.log(`Deleted ${dummyEmpIds.length} dummy employees`);
  }
}

async function createRealEmployees() {
  console.log('\n=== Creating Real Employees ===\n');

  const empDocs = {};
  const userDocs = {};

  for (const emp of REAL_EMPLOYEES) {
    // Check if employee already exists
    const existingEmp = await Employee.findOne({ employeeId: emp.employeeId });
    if (existingEmp) {
      console.log(`Skipping existing employee: ${emp.employeeId} - ${emp.fullName}`);
      empDocs[emp.employeeId] = existingEmp;
      continue;
    }

    // Create employee record
    const empData = {
      employeeId: emp.employeeId,
      fullName: emp.fullName,
      email: emp.email,
      department: emp.department,
      designation: emp.designation,
      manager: emp.manager,
      location: emp.location,
      salary: emp.salary,
      status: emp.status,
      joiningDate: new Date(emp.joiningDate)
    };

    const createdEmp = await Employee.create(empData);
    empDocs[emp.employeeId] = createdEmp;
    console.log(`Created employee: ${emp.employeeId} - ${emp.fullName}`);

    // Check if user already exists
    const existingUser = await User.findOne({ employeeId: emp.employeeId });
    if (existingUser) {
      console.log(`  Skipping existing user: ${emp.email} (${emp.role})`);
      userDocs[emp.role] = existingUser;
      // Link employee to user if not already linked
      if (!createdEmp.user) {
        createdEmp.user = existingUser._id;
        await createdEmp.save();
      }
      continue;
    }

    // Create user account with hashed password
    const userData = {
      employeeId: emp.employeeId,
      fullName: emp.fullName,
      email: emp.email,
      role: emp.role,
      department: emp.department || undefined,
      designation: emp.designation,
      status: 'active',
      isVerified: true
    };

    const user = new User(userData);
    user.password = emp.password; // Will be hashed by the virtual setter
    await user.save();

    userDocs[emp.role] = user;

    // Link employee to user
    createdEmp.user = user._id;
    await createdEmp.save();

    console.log(`  Created user: ${emp.email} (${emp.role})`);
  }

  return { empDocs, userDocs };
}

async function createSampleData(empDocs, userDocs) {
  console.log('\n=== Creating Sample Related Data ===\n');

  const hrUser = userDocs.HR;
  const managerUser = userDocs.MANAGER;
  const employeeUser = userDocs.EMPLOYEE;

  if (!hrUser || !managerUser || !employeeUser) {
    console.log('Missing required users for sample data, skipping...');
    return;
  }

  // Sample leave requests
  const leaveRequests = [
    { employee: empDocs['CY0525RS109']._id, requestedBy: managerUser._id, type: 'Casual Leave', from: '2026-10-20', to: '2026-10-21', days: 2, reason: 'Personal', status: 'Pending' },
    { employee: empDocs['CY0525RS109']._id, requestedBy: employeeUser._id, type: 'Sick Leave', from: '2026-10-22', to: '2026-10-22', days: 1, reason: 'Fever', status: 'Pending' },
    { employee: empDocs['CY0226AR110']._id, type: 'Earned Leave', from: '2026-09-28', to: '2026-09-30', days: 3, reason: 'Trip', status: 'Approved' }
  ];

  for (const leave of leaveRequests) {
    const exists = await Leave.findOne({ employee: leave.employee, from: leave.from, to: leave.to });
    if (!exists) {
      await Leave.create(leave);
      console.log(`Created leave request for ${leave.employee}`);
    }
  }

  // Sample attendance
  const attendanceRecords = [
    { employee: empDocs['CY0525RS109']._id, date: '2026-09-10', status: 'present', checkIn: '09:05 AM' },
    { employee: empDocs['CY0226AR110']._id, date: '2026-09-10', status: 'wfh', checkIn: '09:30 AM' }
  ];

  for (const att of attendanceRecords) {
    const exists = await Attendance.findOne({ employee: att.employee, date: att.date });
    if (!exists) {
      await Attendance.create(att);
      console.log(`Created attendance for ${att.employee}`);
    }
  }

  // Sample payroll
  const payrollRecords = [
    { employee: empDocs['CY0525RS109']._id, period: '2026-08', gross: 75000, deductions: { pf: 4500, tds: 5000, esi: 0 }, status: 'Paid', payDate: new Date('2026-09-01'), paymentMode: 'Bank Transfer', transactionId: 'TXN20260901001', reference: 'SAL-AUG-2026-CY0525RS109', utr: 'UTR2026090100123456' },
    { employee: empDocs['CY0226AR110']._id, period: '2026-08', gross: 75000, deductions: { pf: 4500, tds: 5000, esi: 0 }, status: 'Approved', paymentMode: 'Bank Transfer', transactionId: 'TXN20260901002', reference: 'SAL-AUG-2026-CY0226AR110', utr: 'UTR2026090100223456' }
  ];

  for (const pay of payrollRecords) {
    const exists = await Payroll.findOne({ employee: pay.employee, period: pay.period });
    if (!exists) {
      await Payroll.create(pay);
      console.log(`Created payroll for ${pay.employee}`);
    }
  }

  // Sample hiring
  const hiringRecords = [
    { jobId: 'JOB-101', title: 'Django Developer', department: 'Engineering', openings: 2, status: 'Open', createdBy: hrUser._id,
      candidates: [{ name: 'Ishaan Malhotra', email: 'ishaan.m@example.com', stage: 'Interview', source: 'LinkedIn' }] },
    { jobId: 'JOB-102', title: 'Project Manager', department: 'Project Management', openings: 1, status: 'Open', createdBy: hrUser._id, candidates: [] }
  ];

  for (const job of hiringRecords) {
    const exists = await Hiring.findOne({ jobId: job.jobId });
    if (!exists) {
      await Hiring.create(job);
      console.log(`Created hiring job: ${job.jobId}`);
    }
  }

  // Sample performance reviews
  const perfRecords = [
    { employee: empDocs['CY0525RS109']._id, cycle: '2026-H1', rating: 4, managerFeedback: 'Strong delivery on Django projects.', status: 'Finalized', reviewedBy: hrUser._id,
      goals: [{ title: 'Ship dashboard', weightage: 40, target: '100%', achieved: '100%', status: 'Achieved' }] },
    { employee: empDocs['CY0226AR110']._id, cycle: '2026-H1', rating: 3, managerFeedback: 'Good, room to grow on reporting.', status: 'Submitted', reviewedBy: managerUser._id }
  ];

  for (const perf of perfRecords) {
    const exists = await Performance.findOne({ employee: perf.employee, cycle: perf.cycle });
    if (!exists) {
      await Performance.create(perf);
      console.log(`Created performance review for ${perf.employee}`);
    }
  }

  // Sample projects
  const projectRecords = [
    { projectId: 'PRJ-001', name: 'Client Portal', status: 'Active', manager: empDocs['CY0824SD301']._id, members: [empDocs['CY0525RS109']._id, empDocs['CY0226AR110']._id], progress: 45, createdBy: hrUser._id,
      tasks: [{ title: 'API Development', status: 'In Progress' }] },
    { projectId: 'PRJ-002', name: 'HR Portal', status: 'Active', manager: empDocs['CY0824SD301']._id, members: [empDocs['CY0626AD111']._id], progress: 80, createdBy: hrUser._id }
  ];

  for (const proj of projectRecords) {
    const exists = await Project.findOne({ projectId: proj.projectId });
    if (!exists) {
      await Project.create(proj);
      console.log(`Created project: ${proj.projectId}`);
    }
  }

  // Sample notices
  const noticeRecords = [
    { title: 'Diwali Holiday', body: 'Office closed 1–2 Nov for Diwali.', audience: 'all', pinned: true, author: hrUser._id },
    { title: 'Managers sync', body: 'Monthly managers review on Friday.', audience: 'managers', author: hrUser._id }
  ];

  for (const notice of noticeRecords) {
    const exists = await Notice.findOne({ title: notice.title });
    if (!exists) {
      await Notice.create(notice);
      console.log(`Created notice: ${notice.title}`);
    }
  }

  // Sample ticket
  const ticketRecords = [
    { subject: 'Laptop slow', description: 'Please check my laptop performance.', category: 'IT', priority: 'Medium', raisedBy: employeeUser._id }
  ];

  for (const ticket of ticketRecords) {
    const exists = await Ticket.findOne({ subject: ticket.subject, raisedBy: ticket.raisedBy });
    if (!exists) {
      await Ticket.create(ticket);
      console.log(`Created ticket: ${ticket.subject}`);
    }
  }

  // Sample offboarding
  const offboardRecords = [
    { employee: empDocs['CY0726SS112']._id, initiatedBy: hrUser._id, reason: 'Resignation', lastWorkingDate: new Date('2026-10-15'), status: 'In Progress' }
  ];

  for (const off of offboardRecords) {
    const exists = await Offboarding.findOne({ employee: off.employee });
    if (!exists) {
      await Offboarding.create(off);
      console.log(`Created offboarding for ${off.employee}`);
    }
  }
}

async function printCredentials() {
  console.log('\n=== Migration Complete ===\n');
  console.log('Real CYTHACK Solution Employee Login Credentials:\n');
  console.log('  Email                          Role          Initial Password');
  console.log('  ─────────────────────────────────────────────────────────────');
  
  for (const emp of REAL_EMPLOYEES) {
    console.log(`  ${emp.email.padEnd(32)} ${emp.role.padEnd(12)} ${emp.password}`);
  }
  
  console.log('\n⚠️  IMPORTANT: These are initial passwords. Users should change them on first login.');
  console.log('   Passwords are stored as bcrypt hashes only - never in plaintext.\n');
}

async function runMigration() {
  try {
    await connectDB();

    // Step 1: Find dummy records
    const { dummyUsers, dummyEmployees, existingRealEmployees, existingRealUsers } = await findDummyRecords();

    // Step 2: Delete dummy records
    await deleteDummyRecords(dummyUsers, dummyEmployees);

    // Step 3: Create real employees
    const { empDocs, userDocs } = await createRealEmployees();

    // Step 4: Create sample related data
    await createSampleData(empDocs, userDocs);

    // Step 5: Print credentials
    await printCredentials();

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// Run migration
runMigration();