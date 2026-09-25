<<<<<<< HEAD
/* Development seed — creates users for every role plus sample HR data.
 * Run with:  npm run seed
 * DEVELOPMENT ONLY. Passwords here are throwaway dev credentials; never use
 * these in production. */
const cfg = require('../config/env');
const { connectDB, disconnectDB } = require('../config/database');
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

// dev login accounts (email → role). employeeId links them to an Employee row.
const DEV_USERS = [
  { employeeId: null,      fullName: 'System Owner',  email: 'superadmin@cyethack.com', role: 'SUPER_ADMIN', password: 'Super@123',    department: 'IT' },
  { employeeId: null,      fullName: 'Portal Admin',  email: 'admin@cyethack.com',      role: 'ADMIN',       password: 'Admin@123',    department: 'IT' },
  { employeeId: 'CHS-0001', fullName: 'Kriti Singh',  email: 'hr@cyethack.com',         role: 'HR',          password: 'Hr@123',       department: 'Human Resources', designation: 'HR Lead' },
  { employeeId: 'CHS-0004', fullName: 'Arjun Mehra',  email: 'manager@cyethack.com',    role: 'MANAGER',     password: 'Manager@123',  department: 'Security Operations', designation: 'SOC Manager' },
  { employeeId: 'CHS-0008', fullName: 'Priya Nair',   email: 'employee@cyethack.com',   role: 'EMPLOYEE',    password: 'Employee@123', department: 'Engineering', designation: 'Frontend Developer' }
];

// employee directory (mirrors the portal's shape). manager = manager's employeeId.
const EMPLOYEES = [
  { employeeId: 'CHS-0001', fullName: 'Kriti Singh',  email: 'kriti.singh@cyethack.com',  department: 'Human Resources',   designation: 'HR Lead',            manager: null,       location: 'Noida',  salary: 95000, status: 'Active' },
  { employeeId: 'CHS-0004', fullName: 'Arjun Mehra',  email: 'arjun.mehra@cyethack.com',  department: 'Security Operations', designation: 'SOC Manager',      manager: 'CHS-0001', location: 'Noida',  salary: 120000, status: 'Active' },
  { employeeId: 'CHS-0005', fullName: 'Rahul Mehta',  email: 'rahul.mehta@cyethack.com',  department: 'Security Operations', designation: 'Security Analyst', manager: 'CHS-0004', location: 'Noida',  salary: 68000, status: 'Active' },
  { employeeId: 'CHS-0006', fullName: 'Sana Kapoor',  email: 'sana.kapoor@cyethack.com',  department: 'Security Operations', designation: 'Pentester',       manager: 'CHS-0004', location: 'Remote', salary: 72000, status: 'Active' },
  { employeeId: 'CHS-0007', fullName: 'Vikram Singh', email: 'vikram.singh@cyethack.com', department: 'Engineering',       designation: 'Engineering Lead',   manager: 'CHS-0001', location: 'Noida',  salary: 130000, status: 'Active' },
  { employeeId: 'CHS-0008', fullName: 'Priya Nair',   email: 'priya.nair@cyethack.com',   department: 'Engineering',       designation: 'Frontend Developer', manager: 'CHS-0007', location: 'Remote', salary: 78000, status: 'Active' },
  { employeeId: 'CHS-0009', fullName: 'Rohit Verma',  email: 'rohit.verma@cyethack.com',  department: 'Engineering',       designation: 'Backend Developer',  manager: 'CHS-0007', location: 'Noida',  salary: 82000, status: 'On Leave' }
=======
/* Development seed — creates users for every role plus real HR data.
 * Run with:  npm run seed
 * DEVELOPMENT ONLY. Passwords here are throwaway dev credentials; never use
 * these in production. */
const cfg = require("../config/env");
const { connectDB, disconnectDB } = require("../config/database");
const User = require("../models/User");
const Employee = require("../models/Employee");
const Leave = require("../models/Leave");
const Attendance = require("../models/Attendance");
const Payroll = require("../models/Payroll");
const Hiring = require("../models/Hiring");
const RefreshToken = require("../models/RefreshToken");
const Performance = require("../models/Performance");
const Project = require("../models/Project");
const Document = require("../models/Document");
const Notice = require("../models/Notice");
const Ticket = require("../models/Ticket");
const Offboarding = require("../models/Offboarding");

// dev login accounts (email → role). employeeId links them to an Employee row.
// Passwords are generated as: first 4 alphabetic chars of first name + employeeId
const DEV_USERS = [
  {
    employeeId: "CY0125JS201",
    fullName: "Jaya Sahu",
    email: "jaya.sahu@cyethack.com",
    role: "HR",
    password: "JayaCY0125JS201",
    department: "Human Resources",
    designation: "HR",
  },
  {
    employeeId: "CY0824SD301",
    fullName: "Surya Dev Diwedi",
    email: "surya.dwivedi@cyethack.com",
    role: "MANAGER",
    password: "SuryCY0824SD301",
    department: "Project Management",
    designation: "Project Manager",
  },
  {
    employeeId: "CY0525RS109",
    fullName: "Gangarapu Rohith Sai Ganesh",
    email: "rohith.sai@cyethack.com",
    role: "EMPLOYEE",
    password: "GangCY0525RS109",
    department: "Engineering",
    designation: "Django Developer",
  },
];

const HR_EMPLOYEE_ID = "CY0125JS201";
const BLOOD_GROUPS = ["A+", "O+", "B+", "AB+", "A-", "O-"];
const WORK_MODES = ["On-site", "Hybrid", "Remote", "Work from Home"];

// employee directory (mirrors the portal's shape). manager = manager's employeeId.
const EMPLOYEES = [
  {
    employeeId: "CY0125JS201",
    fullName: "Jaya Sahu",
    email: "jaya.sahu@cyethack.com",
    department: "Human Resources",
    designation: "HR",
    manager: null,
    location: "Work from Home",
    workMode: "Work from Home",
    bloodGroup: "O+",
    assignedHrId: "CY0125JS201",
    salary: 95000,
    status: "Active",
    joiningDate: "2025-01-06",
    bankName: "HDFC Bank",
    accountNumber: "50100123456789",
    ifsc: "HDFC0001234",
    accountHolderName: "Jaya Sahu",
  },
  {
    employeeId: "CY0824SD301",
    fullName: "Surya Dev Diwedi",
    email: "surya.dwivedi@cyethack.com",
    department: "Project Management",
    designation: "Project Manager",
    manager: null,
    location: "Work from Home",
    workMode: "Hybrid",
    bloodGroup: "A+",
    assignedHrId: "CY0125JS201",
    salary: 120000,
    status: "Active",
    joiningDate: "2024-01-08",
    bankName: "ICICI Bank",
    accountNumber: "012301543210",
    ifsc: "ICIC0000123",
    accountHolderName: "Surya Dev Diwedi",
  },
  {
    employeeId: "CY0525RS109",
    fullName: "Gangarapu Rohith Sai Ganesh",
    email: "rohith.sai@cyethack.com",
    department: "Engineering",
    designation: "Django Developer",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "On-site",
    bloodGroup: "B+",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2025-11-05",
    bankName: "State Bank of India",
    accountNumber: "32456789012",
    ifsc: "SBIN0001234",
    accountHolderName: "Gangarapu Rohith Sai Ganesh",
  },
  {
    employeeId: "CY0226AR110",
    fullName: "Athul Rajagopalan P",
    email: "athul.raja@cyethack.com",
    department: "Engineering",
    designation: "Django Developer",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "Remote",
    bloodGroup: "AB+",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2026-02-02",
    bankName: "Axis Bank",
    accountNumber: "917010012345678",
    ifsc: "UTIB0001234",
    accountHolderName: "Athul Rajagopalan P",
  },
  {
    employeeId: "CY0626AD111",
    fullName: "Aman Dange",
    email: "aman.dange@cyethack.com",
    department: "Engineering",
    designation: "Django Developer",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "Hybrid",
    bloodGroup: "O-",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2026-01-06",
    bankName: "Kotak Mahindra Bank",
    accountNumber: "2311234567",
    ifsc: "KKBK0001234",
    accountHolderName: "Aman Dange",
  },
  {
    employeeId: "CY0726SS112",
    fullName: "Sanal Sabu",
    email: "sanal.sabu@cyethack.com",
    department: "Engineering",
    designation: "Django Developer",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "On-site",
    bloodGroup: "A-",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2026-07-25",
    bankName: "Punjab National Bank",
    accountNumber: "0123000100123456",
    ifsc: "PUNB0001234",
    accountHolderName: "Sanal Sabu",
  },
>>>>>>> 0f31467 (intial Update HRM 1.1)
];

// Seeds an ALREADY-CONNECTED database. Exported so tests can reuse it.
async function seedDatabase() {
  await Promise.all([
<<<<<<< HEAD
    User.deleteMany({}), Employee.deleteMany({}), Leave.deleteMany({}),
    Attendance.deleteMany({}), Payroll.deleteMany({}), Hiring.deleteMany({}), RefreshToken.deleteMany({}),
    Performance.deleteMany({}), Project.deleteMany({}), Document.deleteMany({}),
    Notice.deleteMany({}), Ticket.deleteMany({}), Offboarding.deleteMany({})
=======
    User.deleteMany({}),
    Employee.deleteMany({}),
    Leave.deleteMany({}),
    Attendance.deleteMany({}),
    Payroll.deleteMany({}),
    Hiring.deleteMany({}),
    RefreshToken.deleteMany({}),
    Performance.deleteMany({}),
    Project.deleteMany({}),
    Document.deleteMany({}),
    Notice.deleteMany({}),
    Ticket.deleteMany({}),
    Offboarding.deleteMany({}),
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  // employees first
  const empDocs = {};
<<<<<<< HEAD
  for (const e of EMPLOYEES) { empDocs[e.employeeId] = await Employee.create(e); }
=======
  for (const e of EMPLOYEES) {
    empDocs[e.employeeId] = await Employee.create(e);
  }
>>>>>>> 0f31467 (intial Update HRM 1.1)

  // users (hashed via the model's virtual), linked to employees where applicable
  const userDocs = {};
  for (const u of DEV_USERS) {
    const attrs = {
<<<<<<< HEAD
      fullName: u.fullName, email: u.email, role: u.role,
      department: u.department, designation: u.designation, status: 'active', isVerified: true
=======
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      department: u.department,
      designation: u.designation,
      status: "active",
      isVerified: true,
>>>>>>> 0f31467 (intial Update HRM 1.1)
    };
    if (u.employeeId) attrs.employeeId = u.employeeId; // omit (not null) so the sparse index skips it
    const doc = new User(attrs);
    doc.password = u.password; // hashed on save
    await doc.save();
    userDocs[u.role] = doc;
<<<<<<< HEAD
    if (u.employeeId && empDocs[u.employeeId]) { empDocs[u.employeeId].user = doc._id; await empDocs[u.employeeId].save(); }
  }

  // sample leave: one for the manager's team (CHS-0005) and one for the employee (CHS-0008)
  await Leave.create([
    { employee: empDocs['CHS-0005']._id, requestedBy: userDocs.MANAGER._id, type: 'Casual Leave', from: '2026-10-20', to: '2026-10-21', days: 2, reason: 'Personal', status: 'Pending' },
    { employee: empDocs['CHS-0008']._id, requestedBy: userDocs.EMPLOYEE._id, type: 'Sick Leave', from: '2026-10-22', to: '2026-10-22', days: 1, reason: 'Fever', status: 'Pending' },
    { employee: empDocs['CHS-0006']._id, type: 'Earned Leave', from: '2026-09-28', to: '2026-09-30', days: 3, reason: 'Trip', status: 'Approved' }
=======
    if (u.employeeId && empDocs[u.employeeId]) {
      empDocs[u.employeeId].user = doc._id;
      await empDocs[u.employeeId].save();
    }
  }

  // sample leave: one for the manager's team (CY0525RS109) and one for the employee (CY0525RS109)
  await Leave.create([
    {
      employee: empDocs["CY0525RS109"]._id,
      requestedBy: userDocs.MANAGER._id,
      type: "Casual Leave",
      from: "2026-10-20",
      to: "2026-10-21",
      days: 2,
      reason: "Personal",
      status: "Pending",
    },
    {
      employee: empDocs["CY0525RS109"]._id,
      requestedBy: userDocs.EMPLOYEE._id,
      type: "Sick Leave",
      from: "2026-10-22",
      to: "2026-10-22",
      days: 1,
      reason: "Fever",
      status: "Pending",
    },
    {
      employee: empDocs["CY0226AR110"]._id,
      type: "Earned Leave",
      from: "2026-09-28",
      to: "2026-09-30",
      days: 3,
      reason: "Trip",
      status: "Approved",
    },
    {
      employee: empDocs["CY0226AR110"]._id,
      requestedBy: userDocs.EMPLOYEE._id,
      type: "Casual Leave",
      from: "2026-11-01",
      to: "2026-11-02",
      days: 2,
      reason: "Personal",
      status: "Pending",
    },
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  // sample attendance
  await Attendance.create([
<<<<<<< HEAD
    { employee: empDocs['CHS-0008']._id, date: '2026-09-10', status: 'present', checkIn: '09:05 AM' },
    { employee: empDocs['CHS-0005']._id, date: '2026-09-10', status: 'wfh', checkIn: '09:30 AM' }
=======
    {
      employee: empDocs["CY0525RS109"]._id,
      date: "2026-09-10",
      status: "present",
      checkIn: "09:05 AM",
    },
    {
      employee: empDocs["CY0226AR110"]._id,
      date: "2026-09-10",
      status: "wfh",
      checkIn: "09:30 AM",
    },
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  // sample payroll (net computed by the model hook)
  await Payroll.create([
<<<<<<< HEAD
    { employee: empDocs['CHS-0008']._id, period: '2026-08', gross: 78000, deductions: { pf: 4680, tds: 6000, esi: 0 }, status: 'Paid', payDate: new Date('2026-09-01') },
    { employee: empDocs['CHS-0005']._id, period: '2026-08', gross: 68000, deductions: { pf: 4080, tds: 4200, esi: 0 }, status: 'Approved' }
=======
    {
      employee: empDocs["CY0525RS109"]._id,
      period: "2026-08",
      gross: 75000,
      deductions: { pf: 4500, tds: 5000, esi: 0 },
      status: "Paid",
      payDate: new Date("2026-09-01"),
      paymentMode: "Bank Transfer",
      transactionId: "TXN20260901001",
      reference: "SAL-AUG-2026-CY0525RS109",
      utr: "UTR2026090100123456",
    },
    {
      employee: empDocs["CY0226AR110"]._id,
      period: "2026-08",
      gross: 75000,
      deductions: { pf: 4500, tds: 5000, esi: 0 },
      status: "Approved",
      paymentMode: "Bank Transfer",
      transactionId: "TXN20260901002",
      reference: "SAL-AUG-2026-CY0226AR110",
      utr: "UTR2026090100223456",
    },
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  // sample hiring
  await Hiring.create([
<<<<<<< HEAD
    { jobId: 'JOB-101', title: 'Security Analyst (L2)', department: 'Security Operations', openings: 2, status: 'Open', createdBy: userDocs.HR._id,
      candidates: [{ name: 'Ishaan Malhotra', email: 'ishaan.m@example.com', stage: 'Interview', source: 'LinkedIn' }] },
    { jobId: 'JOB-102', title: 'Frontend Developer', department: 'Engineering', openings: 1, status: 'Open', createdBy: userDocs.HR._id, candidates: [] }
  ]);

  // sample performance reviews (employee CHS-0008 own; CHS-0005 in manager's team)
  await Performance.create([
    { employee: empDocs['CHS-0008']._id, cycle: '2026-H1', rating: 4, managerFeedback: 'Strong delivery on the portal UI.', status: 'Finalized', reviewedBy: userDocs.HR._id,
      goals: [{ title: 'Ship dashboard', weightage: 40, target: '100%', achieved: '100%', status: 'Achieved' }] },
    { employee: empDocs['CHS-0005']._id, cycle: '2026-H1', rating: 3, managerFeedback: 'Good, room to grow on reporting.', status: 'Submitted', reviewedBy: userDocs.MANAGER._id }
  ]);

  // sample projects (managed by the manager CHS-0004, members include employee CHS-0008)
  await Project.create([
    { projectId: 'PRJ-001', name: 'SOC Automation', status: 'Active', manager: empDocs['CHS-0004']._id, members: [empDocs['CHS-0005']._id, empDocs['CHS-0006']._id], progress: 45, createdBy: userDocs.HR._id,
      tasks: [{ title: 'Alert pipeline', status: 'In Progress' }] },
    { projectId: 'PRJ-002', name: 'HR Portal', status: 'Active', manager: empDocs['CHS-0007']._id, members: [empDocs['CHS-0008']._id], progress: 80, createdBy: userDocs.HR._id }
=======
    {
      jobId: "JOB-101",
      title: "Django Developer",
      department: "Engineering",
      openings: 2,
      status: "Open",
      createdBy: userDocs.HR._id,
      candidates: [
        {
          name: "Ishaan Malhotra",
          email: "ishaan.m@example.com",
          stage: "Interview",
          source: "LinkedIn",
        },
      ],
    },
    {
      jobId: "JOB-102",
      title: "Project Manager",
      department: "Project Management",
      openings: 1,
      status: "Open",
      createdBy: userDocs.HR._id,
      candidates: [],
    },
  ]);

  // sample performance reviews (employee CY0525RS109 own; CY0226AR110 in manager's team)
  await Performance.create([
    {
      employee: empDocs["CY0525RS109"]._id,
      cycle: "2026-H1",
      rating: 4,
      managerFeedback: "Strong delivery on Django projects.",
      status: "Finalized",
      reviewedBy: userDocs.HR._id,
      goals: [
        {
          title: "Ship dashboard",
          weightage: 40,
          target: "100%",
          achieved: "100%",
          status: "Achieved",
        },
      ],
    },
    {
      employee: empDocs["CY0226AR110"]._id,
      cycle: "2026-H1",
      rating: 3,
      managerFeedback: "Good, room to grow on reporting.",
      status: "Submitted",
      reviewedBy: userDocs.MANAGER._id,
    },
  ]);

  // sample projects (managed by the manager CY0824SD301, members include employee CY0525RS109)
  await Project.create([
    {
      projectId: "PRJ-001",
      name: "Client Portal",
      status: "Active",
      manager: empDocs["CY0824SD301"]._id,
      members: [empDocs["CY0525RS109"]._id, empDocs["CY0226AR110"]._id],
      progress: 45,
      createdBy: userDocs.HR._id,
      tasks: [{ title: "API Development", status: "In Progress" }],
    },
    {
      projectId: "PRJ-002",
      name: "HR Portal",
      status: "Active",
      manager: empDocs["CY0824SD301"]._id,
      members: [empDocs["CY0626AD111"]._id],
      progress: 80,
      createdBy: userDocs.HR._id,
    },
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  // sample notices
  await Notice.create([
<<<<<<< HEAD
    { title: 'Diwali Holiday', body: 'Office closed 1–2 Nov for Diwali.', audience: 'all', pinned: true, author: userDocs.HR._id },
    { title: 'Managers sync', body: 'Monthly managers review on Friday.', audience: 'managers', author: userDocs.HR._id }
=======
    {
      title: "Diwali Holiday",
      body: "Office closed 1–2 Nov for Diwali.",
      audience: "all",
      pinned: true,
      author: userDocs.HR._id,
    },
    {
      title: "Managers sync",
      body: "Monthly managers review on Friday.",
      audience: "managers",
      author: userDocs.HR._id,
    },
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  // sample helpdesk ticket raised by the employee
  await Ticket.create([
<<<<<<< HEAD
    { subject: 'Laptop slow', description: 'Please check my laptop performance.', category: 'IT', priority: 'Medium', raisedBy: userDocs.EMPLOYEE._id }
  ]);

  // sample offboarding (initiated for CHS-0009, who is On Leave)
  await Offboarding.create([
    { employee: empDocs['CHS-0009']._id, initiatedBy: userDocs.HR._id, reason: 'Resignation', lastWorkingDate: new Date('2026-10-15'), status: 'In Progress' }
=======
    {
      subject: "Laptop slow",
      description: "Please check my laptop performance.",
      category: "IT",
      priority: "Medium",
      raisedBy: userDocs.EMPLOYEE._id,
    },
  ]);

  // sample offboarding (initiated for CY0726SS112, who is Active)
  await Offboarding.create([
    {
      employee: empDocs["CY0726SS112"]._id,
      initiatedBy: userDocs.HR._id,
      reason: "Resignation",
      lastWorkingDate: new Date("2026-10-15"),
      status: "In Progress",
    },
>>>>>>> 0f31467 (intial Update HRM 1.1)
  ]);

  return { users: userDocs, employees: empDocs };
}

// CLI runner: connect, seed, print credentials, disconnect.
async function run() {
<<<<<<< HEAD
  if (cfg.isProd && process.env.FORCE_SEED !== 'true') {
    console.error('Refusing to seed in production. Set FORCE_SEED=true to override (not recommended).');
    process.exit(1);
  }
  await connectDB();
  console.log('Clearing existing data & seeding…');
  await seedDatabase();
  console.log('\nSeed complete. DEVELOPMENT login accounts (change before real use):\n');
  DEV_USERS.forEach((u) => console.log('  ' + u.email.padEnd(30) + u.role.padEnd(13) + 'password: ' + u.password));
  console.log('\nEmployees: ' + EMPLOYEES.length + ' | Manager "manager@cyethack.com" manages CHS-0005 & CHS-0006.');
=======
  if (cfg.isProd && process.env.FORCE_SEED !== "true") {
    console.error(
      "Refusing to seed in production. Set FORCE_SEED=true to override (not recommended).",
    );
    process.exit(1);
  }
  await connectDB();
  console.log("Clearing existing data & seeding…");
  await seedDatabase();
  console.log(
    "\nSeed complete. DEVELOPMENT login accounts (change before real use):\n",
  );
  DEV_USERS.forEach((u) =>
    console.log(
      "  " + u.email.padEnd(30) + u.role.padEnd(13) + "password: " + u.password,
    ),
  );
  console.log(
    "\nEmployees: " +
      EMPLOYEES.length +
      ' | Manager "manager@cyethack.com" manages CY0525RS109, CY0226AR110, CY0626AD111, CY0726SS112.',
  );
>>>>>>> 0f31467 (intial Update HRM 1.1)
  await disconnectDB();
}

module.exports = { seedDatabase, DEV_USERS, EMPLOYEES };

if (require.main === module) {
<<<<<<< HEAD
  run().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
=======
  run().catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
>>>>>>> 0f31467 (intial Update HRM 1.1)
}
