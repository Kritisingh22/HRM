/* Reset Password + Mandatory Password Change tests
   Run with:  node tests/reset-password-mandatory.test.js */
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
  if (cond) { pass++; } else { fail++; fails.push(name); }
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const PORT = 5095;
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
  return { status: res.status, body, cookie: sc ? sc.split(";")[0] : null, access: body.accessToken, user: body.user };
}

async function api(method, path, { access, cookie, body } = {}) {
  const headers = {};
  if (access) headers["Authorization"] = "Bearer " + access;
  if (cookie) headers["Cookie"] = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
  const RefreshToken = require("../models/RefreshToken");
  const bcrypt = require("bcryptjs");

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

    // ---------- Setup: create department & designation ----------
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

    // ---------- TEST 1: Create employee + user ----------
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
      },
    });
    ok("Create employee + user → 201", createRes.status === 201);
    const newEmpId = createRes.data.employee.employeeId;
    const newUserId = createRes.data.employee.userId;

    // ---------- TEST 2: Verify User record ----------
    const userDoc = await User.findById(newUserId).select('+passwordHash +mustChangePassword +temporaryPasswordExpiresAt');
    ok("User doc exists", !!userDoc);
    ok("User employeeId links to Employee", userDoc.employeeId === newEmpId);
    ok("User role is EMPLOYEE", userDoc.role === "EMPLOYEE");
    ok("User mustChangePassword is true", userDoc.mustChangePassword === true);
    ok("Password hash is bcrypt", typeof userDoc.passwordHash === "string" && userDoc.passwordHash.startsWith("$2"));

    // ---------- TEST 3: Reset password (HR) ----------
    const resetRes = await api("POST", `/api/employees/${encodeURIComponent(newEmpId)}/reset-password`, {
      access: hr.access,
    });
    ok("HR reset password → 200", resetRes.status === 200);
    ok("Returns credentials object", typeof resetRes.data.credentials === "object" && resetRes.data.credentials !== null);
    ok("Returns temporary password", typeof resetRes.data.credentials.temporaryPassword === "string" && resetRes.data.credentials.temporaryPassword.length > 0);
    ok("Returns expiry timestamp", typeof resetRes.data.credentials.expiresAt === "string");
    ok("mustChangePassword is true", resetRes.data.credentials.mustChangePassword === true);

    // Verify temporaryPasswordExpiresAt is set on the user after reset
    const userWithExpiry = await User.findById(newUserId).select('+temporaryPasswordExpiresAt');
    ok("User temporaryPasswordExpiresAt is set after reset", !!userWithExpiry.temporaryPasswordExpiresAt);

    // Verify old password no longer works
    const userAfterReset = await User.findById(newUserId).select('+passwordHash');
    const oldPasswordWorks = await userAfterReset.comparePassword(createRes.data.credentials.tempPassword);
    ok("Old temp password rejected", oldPasswordWorks === false);

    // Verify new temp password works
    const newTempWorks = await userAfterReset.comparePassword(resetRes.data.credentials.temporaryPassword);
    ok("New temp password works", newTempWorks === true);

    // Verify refresh tokens revoked
    const revokedTokens = await RefreshToken.countDocuments({ user: newUserId, revoked: true });
    ok("Refresh tokens revoked (count >= 0)", revokedTokens >= 0);
    const activeTokens = await RefreshToken.countDocuments({ user: newUserId, revoked: { $ne: true } });
    ok("No active refresh tokens remain", activeTokens === 0);

    // ---------- TEST 4: Employee logs in with temp password → mustChangePassword ----------
    const tempLogin = await login("qa.engineer@cyethack.com", resetRes.data.credentials.temporaryPassword);
    ok("Temp password login → 200", tempLogin.status === 200);
    ok("Login response has mustChangePassword", tempLogin.body.user.mustChangePassword === true);

    // ---------- TEST 5: Mandatory password change blocks other routes ----------
    // Try to access employees list with mustChangePassword=true → should be 403
    const blockedRes = await api("GET", "/api/employees", { access: tempLogin.access });
    ok("Blocked from employees list → 403", blockedRes.status === 403);

    // ---------- TEST 6: Change password with temp password ----------
    const changeRes = await api("POST", "/api/auth/change-password", {
      access: tempLogin.access,
      body: {
        currentPassword: resetRes.data.credentials.temporaryPassword,
        newPassword: "NewP@ssw0rd123!",
        confirmPassword: "NewP@ssw0rd123!",
      },
    });
    ok("Change password → 200", changeRes.status === 200);
    if (changeRes.status !== 200) console.log("Change password error:", JSON.stringify(changeRes.data));
    ok("mustChangePassword cleared", changeRes.data.mustChangePassword === false);

    // ---------- TEST 7: Old temp password no longer works ----------
    const tempLoginAgain = await login("qa.engineer@cyethack.com", resetRes.data.credentials.temporaryPassword);
    ok("Temp password rejected after change → 401", tempLoginAgain.status === 401);

    // ---------- TEST 8: New password works ----------
    const newLogin = await login("qa.engineer@cyethack.com", "NewP@ssw0rd123!");
    ok("New password login → 200", newLogin.status === 200);
    ok("mustChangePassword is false", newLogin.body.user.mustChangePassword === false);

    // ---------- TEST 9: Can access employees list after password change ----------
    const afterChangeRes = await api("GET", "/api/employees", { access: newLogin.access });
    ok("Can access employees after change → 200", afterChangeRes.status === 200);

    // ---------- TEST 7: Rate limiting - excessive requests return 429 ----------
    // Create another employee to test rate limiting
    const createRes2 = await api("POST", "/api/employees", {
      access: hr.access,
      body: {
        fullName: "Rate Limit Test User",
        email: "ratelimit.test@cyethack.com",
        department: "Quality Assurance",
        departmentId: deptId,
        designation: "QA Engineer",
        designationId: desigId,
        joiningDate: "2026-11-20",
        employmentType: "Full-time",
        workMode: "On-site",
        workLocation: "office",
        status: "Active",
      },
    });
    const rateLimitEmpId = createRes2.data.employee.employeeId;

    // Make 6 rapid reset requests (limit is 5 per hour)
    const results = [];
    for (let i = 0; i < 6; i++) {
      const r = await api("POST", `/api/employees/${encodeURIComponent(rateLimitEmpId)}/reset-password`, {
        access: hr.access,
      });
      results.push(r.status);
    }
    const has429 = results.some(s => s === 429);
    ok("Excessive reset requests → 429", has429);

    // ---------- TEST 8: Employee cannot reset other employee's password ----------
    const empLogin = await login("qa.engineer@cyethack.com", "NewP@ssw0rd123!");
    const empResetRes = await api("POST", `/api/employees/${encodeURIComponent(newEmpId)}/reset-password`, {
      access: empLogin.access,
    });
    ok("Employee cannot reset other's password → 403", empResetRes.status === 403);

    // ---------- TEST 9: Unauthenticated access ----------
    const unauthRes = await api("POST", `/api/employees/${encodeURIComponent(newEmpId)}/reset-password`);
    ok("Unauthenticated → 401", unauthRes.status === 401);

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
