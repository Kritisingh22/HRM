/* Employee Profile API tests against a real MongoDB
   (mongodb-memory-server) and the real Express app.
   Run with:  node tests/employee-profile.test.js
   Covers: Employee+User creation linking, profile retrieval with
   populated references, document endpoint, salary RBAC. */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";

const { MongoMemoryServer } = require("mongodb-memory-server");

let pass = 0,
  fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(name);
  }
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const PORT = 5096;
const BASE = "http://localhost:" + PORT;

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const sc = res.headers.getSetCookie
    ? res.headers.getSetCookie().find((s) => s.startsWith("cyethack_refresh="))
    : null;
  return {
    status: res.status,
    body,
    cookie: sc ? sc.split(";")[0] : null,
    access: body.accessToken,
    user: body.user,
  };
}

async function api(method, path, { access, cookie, body } = {}) {
  const headers = {};
  if (access) headers["Authorization"] = "Bearer " + access;
  if (cookie) headers["Cookie"] = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, res };
}

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase, DEV_USERS } = require("../seeds/seed");
  await seedDatabase();
  const { provisionUsers } = require("../seeds/provision-real-users");
  const User = require("../models/User");
  const Employee = require("../models/Employee");
  const Department = require("../models/Department");
  const Designation = require("../models/Designation");

  const realProvisionAccounts = DEV_USERS.filter(
    (u) => u.employeeId && u.employeeId.startsWith("CY"),
  ).map(({ employeeId, fullName, role, email, password }) => ({
    employeeId, fullName, role, email, password,
  }));
  await provisionUsers(realProvisionAccounts);

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    // ---------- authenticate ----------
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok("HR login → 200", hr.status === 200 && !!hr.access);

    const employee = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    ok("Employee login → 200", employee.status === 200 && !!employee.access);

    // ---------- Setup: create a department & designation for the new employee ----------
    const deptRes = await api("POST", "/api/departments", {
      access: hr.access,
      body: { name: "Quality Assurance", description: "QA team" },
    });
    ok("Create QA department → 201", deptRes.status === 201);
    const deptId = deptRes.data.department._id;

    const desigRes = await api("POST", "/api/designations", {
      access: hr.access,
      body: { name: "QA Engineer", departmentId: deptId, description: "Tests software" },
    });
    ok("Create QA Engineer designation → 201", desigRes.status === 201);
    const desigId = desigRes.data.designation._id;

    // ---------- TEST: Create employee + user together ----------
    const createRes = await api("POST", "/api/employees", {
      access: hr.access,
      body: {
        fullName: "Test QA Engineer",
        email: "qa.engineer@cyethack.com",
        department: "Quality Assurance",
        departmentId: deptId,
        designation: "QA Engineer",
        designationId: desigId,
        joiningDate: "2026-11-20",
        employmentType: "Full-time",
        workMode: "On-site",
        workLocation: "office",
        status: "Active",
        salary: 75000,
        grade: "Q1",
        phone: "+91 9876543210",
        address: "123 Tech Park, Bangalore",
        emergencyContact: "Emergency Contact - 9999999999",
      },
    });
    ok("Create employee + user → 201", createRes.status === 201);
    ok("Returns employeeId", typeof createRes.data.employee.employeeId === "string");
    ok("Returns userId", typeof createRes.data.employee.userId === "string");
    ok("Returns temp password", typeof createRes.data.credentials.tempPassword === "string");
    ok("Returns welcome text", typeof createRes.data.welcomeText === "string");

    const newEmpId = createRes.data.employee.employeeId;
    const newUserId = createRes.data.employee.userId;

    // ---------- TEST: Verify Employee record in MongoDB ----------
    const empDoc = await Employee.findOne({ employeeId: newEmpId });
    ok("Employee doc exists in MongoDB", !!empDoc);
    ok("Employee name matches", empDoc.fullName === "Test QA Engineer");
    ok("Employee department matches", empDoc.department === "Quality Assurance");
    ok("Employee designation matches", empDoc.designation === "QA Engineer");
    ok("Employee departmentId matches dept", String(empDoc.departmentId) === String(deptId));
    ok("Employee designationId matches desig", String(empDoc.designationId) === String(desigId));
    ok("Employee linked to user", String(empDoc.user) === String(newUserId));
    ok("Employee userId matches", empDoc.userId === newUserId);

    // ---------- TEST: Verify User record in MongoDB ----------
    const userDoc = await User.findById(newUserId);
    ok("User doc exists in MongoDB", !!userDoc);
    ok("User email matches", userDoc.email === "qa.engineer@cyethack.com");
    ok("User role is EMPLOYEE", userDoc.role === "EMPLOYEE");
    ok("User employeeId links to Employee", userDoc.employeeId === newEmpId);
    ok("User accountStatus is pending-activation", userDoc.accountStatus === "pending-activation");
    ok("User mustChangePassword is true", userDoc.mustChangePassword === true);

    // Reload user with passwordHash selected to verify it's hashed
    const userDocWithHash = await User.findById(newUserId).select('+passwordHash');
    ok("User passwordHash starts with bcrypt prefix", typeof userDocWithHash.passwordHash === "string" && userDocWithHash.passwordHash.startsWith("$2"));

    // ---------- TEST: GET /api/employees/:id returns linked references ----------
    const profileRes = await api("GET", `/api/employees/${encodeURIComponent(newEmpId)}`, {
      access: hr.access,
    });
    ok("GET employee profile → 200", profileRes.status === 200);
    ok("Returns employee object", !!profileRes.data.employee);
    ok("Returns linked user", !!profileRes.data.user);
    ok("Returns department details", !!profileRes.data.department);
    ok("Returns designation details", !!profileRes.data.designation);
    ok("User email in profile", profileRes.data.user.email === "qa.engineer@cyethack.com");
    ok("Department name in profile", profileRes.data.department.name === "Quality Assurance");
    ok("Designation name in profile", profileRes.data.designation.name === "QA Engineer");
    ok("Salary included for HR", profileRes.data.employee.salary === 75000);

    // ---------- TEST: GET /api/employees/:id/document ----------
    const docRes = await api("GET", `/api/employees/${encodeURIComponent(newEmpId)}/document`, {
      access: hr.access,
    });
    ok("GET employee document → 200", docRes.status === 200);
    ok("Returns document data", !!docRes.data.document);
    ok("Document has employeeId", docRes.data.document.employeeId === newEmpId);
    ok("Document has full name", docRes.data.document.fullName === "Test QA Engineer");
    ok("Document has department", docRes.data.document.department === "Quality Assurance");
    ok("Document has designation", docRes.data.document.designation === "QA Engineer");
    ok("Document includes salary for HR", docRes.data.document.salary === 75000);
    ok("Document has generatedAt", typeof docRes.data.generatedAt === "string");

    // ---------- TEST: Salary RBAC - Employee can view own profile (salary omitted) ----------
    const empProfileRes = await api("GET", `/api/employees/${encodeURIComponent(employee.body.user.employeeId || 'CY0525RS109')}`, {
      access: employee.access,
    });
    ok("Employee can view own profile → 200", empProfileRes.status === 200);
    ok("Employee profile omits salary", empProfileRes.data.employee.salary === undefined);

    // Employee document endpoint omits salary
    const empDocRes = await api("GET", `/api/employees/${encodeURIComponent(employee.body.user.employeeId || 'CY0525RS109')}/document`, {
      access: employee.access,
    });
    ok("Employee document omits salary", empDocRes.data.document.salary === "Restricted");

    // ---------- TEST: Unauthorized access ----------
    const unauthRes = await api("GET", `/api/employees/${encodeURIComponent(newEmpId)}`);
    ok("Unauthenticated access → 401", unauthRes.status === 401);

    // ---------- TEST: Invalid employee ID ----------
    const invalidRes = await api("GET", "/api/employees/nonexistent-id", { access: hr.access });
    ok("Invalid employee ID → 404", invalidRes.status === 404);

  } catch (err) {
    console.error("TEST HARNESS ERROR:", err);
  } finally {
    await server.close();
    await disconnectDB();
    console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
    if (fails.length) {
      console.log("Failed:");
      fails.forEach((f) => console.log("  -", f));
      process.exit(1);
    }
  }
})();
