/* Explicit, non-destructive provisioning for the six real HRM accounts.
 * Initial passwords are read from environment variables and are never logged.
 * Existing hashes are preserved; a missing hash is repaired only when its
 * corresponding password is supplied. No admin/dummy accounts or sample data
 * are created. Existing Employee rows are linked only when identity matches.
 *
 * Run manually: npm run provision:real-users
 */
require("dotenv").config();
const cfg = require("../config/env");
const { connectDB, disconnectDB } = require("../config/database");
const User = require("../models/User");
const Employee = require("../models/Employee");

const REAL_USERS = [
  {
    employeeId: "CY0125JS201",
    fullName: "Jaya Sahu",
    role: "HR",
    email: "jaya.sahu@cyethack.com",
    department: "Human Resources",
    designation: "HR",
    manager: null,
    assignedHrId: "CY0125JS201",
    joiningDate: "2025-01-06",
    passwordEnv: "INITIAL_PASSWORD_CY0125JS201",
  },
  {
    employeeId: "CY0824SD301",
    fullName: "Surya Dev Diwedi",
    role: "MANAGER",
    email: "surya.dwivedi@cyethack.com",
    department: "Project Management",
    designation: "PROJECT MANAGER",
    manager: null,
    assignedHrId: "CY0125JS201",
    joiningDate: "2024-01-08",
    passwordEnv: "INITIAL_PASSWORD_CY0824SD301",
  },
  {
    employeeId: "CY0525RS109",
    fullName: "Gangarapu Rohith Sai Ganesh",
    role: "EMPLOYEE",
    email: "rohith.sai@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0125JS201",
    assignedHrId: "CY0125JS201",
    joiningDate: "2025-11-05",
    passwordEnv: "INITIAL_PASSWORD_CY0525RS109",
  },
  {
    employeeId: "CY0226AR110",
    fullName: "Athul Rajagopalan P",
    role: "EMPLOYEE",
    email: "athul.raja@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0824SD301",
    assignedHrId: "CY0125JS201",
    joiningDate: "2026-02-02",
    passwordEnv: "INITIAL_PASSWORD_CY0226AR110",
  },
  {
    employeeId: "CY0626AD111",
    fullName: "Aman Dange",
    role: "EMPLOYEE",
    email: "aman.dange@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0824SD301",
    assignedHrId: "CY0125JS201",
    joiningDate: "2026-01-06",
    passwordEnv: "INITIAL_PASSWORD_CY0626AD111",
  },
  {
    employeeId: "CY0726SS112",
    fullName: "Sanal Sabu",
    role: "EMPLOYEE",
    email: "sanal.sabu@cyethack.com",
    department: "Engineering",
    designation: "DJANGO DEVELOPER",
    manager: "CY0824SD301",
    assignedHrId: "CY0125JS201",
    joiningDate: "2026-07-25",
    passwordEnv: "INITIAL_PASSWORD_CY0726SS112",
  },
];

async function provisionUsers(accounts) {
  const results = [];
  for (const account of accounts) {
    const users = await User.find({
      $or: [
        { employeeId: account.employeeId },
        { email: account.email.toLowerCase() },
      ],
    }).select("+passwordHash");

    const uniqueUsers = [
      ...new Map(users.map((user) => [String(user._id), user])).values(),
    ];
    if (uniqueUsers.length > 1) {
      throw new Error(
        `Conflicting user records for ${account.employeeId}; resolve the identity conflict manually.`,
      );
    }

    let user = uniqueUsers[0];
    const isNew = !user;
    if (isNew) {
      user = new User({
        employeeId: account.employeeId,
        fullName: account.fullName,
        email: account.email,
        role: account.role,
        status: "active",
        isVerified: true,
      });
    } else {
      if (user.employeeId && user.employeeId !== account.employeeId) {
        throw new Error(
          `Email/employee ID conflict for ${account.employeeId}; no data was changed.`,
        );
      }
      if (
        user.email &&
        user.email.toLowerCase() !== account.email.toLowerCase()
      ) {
        throw new Error(
          `Email/employee ID conflict for ${account.employeeId}; no data was changed.`,
        );
      }
      if (user.role !== account.role) {
        throw new Error(
          `Role mismatch for ${account.employeeId}; review and correct it manually.`,
        );
      }
    }

    if (!user.employeeId) user.employeeId = account.employeeId;
    if (!user.fullName) user.fullName = account.fullName;
    if (!user.email) user.email = account.email;

    const needsHash =
      typeof user.passwordHash !== "string" || user.passwordHash.length === 0;
    if (needsHash) user.password = account.password;
    if (isNew || needsHash || user.isModified()) await user.save();

    const employees = await Employee.find({
      $or: [
        { employeeId: account.employeeId },
        { email: account.email.toLowerCase() },
      ],
    });
    const uniqueEmployees = [
      ...new Map(
        employees.map((employee) => [String(employee._id), employee]),
      ).values(),
    ];
    if (uniqueEmployees.length > 1) {
      throw new Error(
        `Conflicting Employee records for ${account.employeeId}; the user was provisioned but no Employee row was changed.`,
      );
    }
    if (uniqueEmployees.length === 1) {
      const employee = uniqueEmployees[0];
      if (
        employee.employeeId !== account.employeeId ||
        (employee.email &&
          employee.email.toLowerCase() !== account.email.toLowerCase())
      ) {
        throw new Error(
          `Employee identity conflict for ${account.employeeId}; no Employee data was changed.`,
        );
      }
      if (employee.user && String(employee.user) !== String(user._id)) {
        throw new Error(
          `Employee ${account.employeeId} is linked to a different user; no link was changed.`,
        );
      }
      if (!employee.user) {
        employee.user = user._id;
        await employee.save();
      }
    } else {
      await Employee.create({
        employeeId: account.employeeId,
        user: user._id,
        fullName: account.fullName,
        email: account.email,
        department: account.department,
        designation: account.designation,
        manager: account.manager,
        assignedHrId: account.assignedHrId,
        joiningDate: new Date(account.joiningDate),
        status: "Active",
      });
    }

    results.push({
      employeeId: account.employeeId,
      status: isNew
        ? "created"
        : needsHash
          ? "hash repaired"
          : "existing hash preserved",
    });
  }
  return results;
}

async function run() {
  if (!cfg.MONGODB_URI) throw new Error("Set MONGODB_URI before provisioning.");
  const accounts = REAL_USERS.map((user) => ({
    ...user,
    password: process.env[user.passwordEnv],
  }));
  const missing = accounts.filter(
    (user) => typeof user.password !== "string" || user.password.length < 8,
  );
  if (missing.length) {
    throw new Error(
      `Set an 8+ character value for: ${missing.map((user) => user.passwordEnv).join(", ")}`,
    );
  }

  await connectDB();
  try {
    const results = await provisionUsers(accounts);
    results.forEach((result) =>
      console.log(`${result.employeeId}: ${result.status}`),
    );
    console.log("Provisioning complete. Password values were not logged.");
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Provisioning failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { REAL_USERS, provisionUsers };
