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
    employeeId: "ADMIN-001",
    fullName: "ADMIN USER",
    email: "admin@cyethack.com",
    role: "ADMIN",
    password: "Admin@123",
    department: "Administration",
    designation: "Administrator",
  },
  {
    employeeId: "SUPER-001",
    fullName: "SUPER ADMIN USER",
    email: "superadmin@cyethack.com",
    role: "SUPER_ADMIN",
    password: "Super@123",
    department: "Administration",
    designation: "Super Administrator",
  },
  {
    employeeId: "CY0125JS201",
    fullName: "JAYA SAHU",
    email: "jaya.sahu@cyethack.com",
    role: "HR",
    password: "JayaCY0125JS201",
    department: "Human Resources",
    designation: "HR",
  },
  {
    employeeId: "CY0824SD301",
    fullName: "SURYA DEV DIWEDI",
    email: "surya.dwivedi@cyethack.com",
    role: "MANAGER",
    password: "SuryCY0824SD301",
    department: "Project Management",
    designation: "PROJECT MANAGER",
  },
  {
    employeeId: "CY0525RS109",
    fullName: "GANGARAPU ROHITH SAI GANESH",
    email: "rohith.sai@cyethack.com",
    role: "EMPLOYEE",
    password: "GangCY0525RS109",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
  },
  {
    employeeId: "CY0226AR110",
    fullName: "ATHUL RAJAGOPALAN P",
    email: "athul.raja@cyethack.com",
    role: "EMPLOYEE",
    password: "AthuCY0226AR110",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
  },
  {
    employeeId: "CY0626AD111",
    fullName: "AMAN DANGE",
    email: "aman.dange@cyethack.com",
    role: "EMPLOYEE",
    password: "AmanCY0626AD111",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
  },
  {
    employeeId: "CY0726SS112",
    fullName: "SANAL SABU",
    email: "sanal.sabu@cyethack.com",
    role: "EMPLOYEE",
    password: "SanaCY0726SS112",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
  },
];

const HR_EMPLOYEE_ID = "CY0125JS201";
const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "Unknown",
];
const WORK_MODES = ["On-site", "Hybrid", "Remote", "Work from Home"];

// employee directory (mirrors the portal's shape). manager = manager's employeeId.
const EMPLOYEES = [
  {
    employeeId: "CY0125JS201",
    fullName: "JAYA SAHU",
    email: "jaya.sahu@cyethack.com",
    department: "Human Resources",
    designation: "HR",
    manager: null,
    location: "Work from Home",
    workMode: "Work from Home",
    bloodGroup: "B+",
    assignedHrId: "CY0125JS201",
    salary: 95000,
    status: "Active",
    joiningDate: "2025-01-06",
    bankName: "HDFC Bank",
    accountNumber: "50100123456789",
    ifsc: "HDFC0001234",
    accountHolderName: "JAYA SAHU",
  },
  {
    employeeId: "CY0824SD301",
    fullName: "SURYA DEV DIWEDI",
    email: "surya.dwivedi@cyethack.com",
    department: "Project Management",
    designation: "PROJECT MANAGER",
    manager: null,
    location: "Work from Home",
    workMode: "Work from Home",
    bloodGroup: "B+",
    assignedHrId: "CY0125JS201",
    salary: 120000,
    status: "Active",
    joiningDate: "2024-01-08",
    bankName: "ICICI Bank",
    accountNumber: "012301543210",
    ifsc: "ICIC0000123",
    accountHolderName: "SURYA DEV DIWEDI",
  },
  {
    employeeId: "CY0525RS109",
    fullName: "GANGARAPU ROHITH SAI GANESH",
    email: "rohith.sai@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0125JS201",
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
    accountHolderName: "GANGARAPU ROHITH SAI GANESH",
  },
  {
    employeeId: "CY0226AR110",
    fullName: "ATHUL RAJAGOPALAN P",
    email: "athul.raja@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "On-site",
    bloodGroup: "B+",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2026-02-02",
    bankName: "Axis Bank",
    accountNumber: "917010012345678",
    ifsc: "UTIB0001234",
    accountHolderName: "ATHUL RAJAGOPALAN P",
  },
  {
    employeeId: "CY0626AD111",
    fullName: "AMAN DANGE",
    email: "aman.dange@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "On-site",
    bloodGroup: "A+",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2026-01-06",
    bankName: "Kotak Mahindra Bank",
    accountNumber: "2311234567",
    ifsc: "KKBK0001234",
    accountHolderName: "AMAN DANGE",
  },
  {
    employeeId: "CY0726SS112",
    fullName: "SANAL SABU",
    email: "sanal.sabu@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0824SD301",
    location: "Client site",
    workMode: "On-site",
    bloodGroup: "O-",
    assignedHrId: "CY0125JS201",
    salary: 75000,
    status: "Active",
    joiningDate: "2026-07-25",
    bankName: "Punjab National Bank",
    accountNumber: "0123000100123456",
    ifsc: "PUNB0001234",
    accountHolderName: "SANAL SABU",
  },
];

// Seeds an ALREADY-CONNECTED database. Exported so tests can reuse it.
async function seedDatabase() {
  await Promise.all([
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
  ]);

  // employees first
  const empDocs = {};
  for (const e of EMPLOYEES) {
    empDocs[e.employeeId] = await Employee.create(e);
  }

  // users (hashed via the model's virtual), linked to employees where applicable
  const userDocs = {};
  for (const u of DEV_USERS) {
    const attrs = {
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      department: u.department,
      designation: u.designation,
      status: "active",
      isVerified: true,
    };
    if (u.employeeId) attrs.employeeId = u.employeeId; // omit (not null) so the sparse index skips it
    const doc = new User(attrs);
    doc.password = u.password; // hashed on save
    await doc.save();
    userDocs[u.employeeId] = doc; // keyed by employeeId — role alone collides now that 4 of the 6 are EMPLOYEE
    if (u.employeeId && empDocs[u.employeeId]) {
      empDocs[u.employeeId].user = doc._id;
      await empDocs[u.employeeId].save();
    }
  }

  // Named references for the sample data below (HR = Jaya, Manager = Surya,
  // "the employee" in these fixtures = Rohith, the one with sample leave/tickets).
  userDocs.ADMIN = userDocs["ADMIN-001"];
  userDocs.SUPER_ADMIN = userDocs["SUPER-001"];
  userDocs.HR = userDocs["CY0125JS201"];
  userDocs.MANAGER = userDocs["CY0824SD301"];
  userDocs.EMPLOYEE = userDocs["CY0525RS109"];

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
  ]);

  // sample attendance
  await Attendance.create([
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
  ]);

  // sample payroll (net computed by the model hook)
  await Payroll.create([
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
  ]);

  // sample hiring
  await Hiring.create([
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
      members: [empDocs["CY0525RS109"]._id, empDocs["CY0626AD111"]._id],
      progress: 80,
      createdBy: userDocs.HR._id,
    },
  ]);

  // sample notices
  await Notice.create([
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
  ]);

  // sample helpdesk ticket raised by the employee
  await Ticket.create([
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
  ]);

  return { users: userDocs, employees: empDocs };
}

// CLI runner: connect, seed, print credentials, disconnect.
async function run() {
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
      ' | Manager "surya.dwivedi@cyethack.com" manages CY0226AR110, CY0626AD111, CY0726SS112.',
  );
  await disconnectDB();
}

module.exports = { seedDatabase, DEV_USERS, EMPLOYEES };

if (require.main === module) {
  run().catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
}
