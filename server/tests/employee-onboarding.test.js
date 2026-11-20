/* Employee onboarding end-to-end test — REAL app + REAL MongoDB
 *
 * Covers:
 *   1. HR creates employee + user account (POST /api/employees) with credentials + welcomeText
 *   2. Employee ID auto-generated server-side
 *   3. Username generated from email prefix/employeeId, made unique on collision
 *   4. Welcome text contains login URL, username, temp password
 *   5. Login accepts username OR email + returns mustChangePassword flag
 *   6. Forced password change flow: login → mustChangePassword → change-password → login with new password
 *   7. Duplicate email rejected (409), no orphan records
 *   8. Employee cannot create another employee (403)
 *   9. Manager can create a reporting employee
 *   10. Reset credentials (POST /api/employees/:id/reset-credentials) returns new welcomeText
 *   11. Change password enforces complexity, clears mustChangePassword
 *   12. Offer letter generated and stored
 *   13. Concurrent employee creation → unique IDs
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";
process.env.PORTAL_URL = "http://localhost:5000";

const { MongoMemoryServer } = require("mongodb-memory-server");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; fails.push(name); console.log("FAIL " + name + (extra ? " — " + extra : "")); }
}
const PORT = 5097;
const BASE = "http://localhost:" + PORT;

async function login(loginId, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: loginId, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, access: body.accessToken, user: body.user };
}
async function apiJson(method, pathStr, { access, body } = {}) {
  const headers = {};
  if (access) headers.Authorization = "Bearer " + access;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + pathStr, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();
  const Employee = require("../models/Employee");
  const User = require("../models/User");
  const Document = require("../models/Document");
  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok("1. HR login → 200", hr.status === 200 && !!hr.access);

    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const manager = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");
    const EmployeeM = require("../models/Employee");
    const hrDoc = await EmployeeM.findOne({ employeeId: "CY0125JS201" });
    const mgrDoc = await EmployeeM.findOne({ employeeId: "CY0824SD301" });
    todayISO();

    // ============ 2. HR creates employee + user (new response format) ============
    const create = await apiJson("POST", "/api/employees", {
      access: hr.access,
      body: {
        fullName: "New Hire Employee",
        firstName: "New Hire",
        lastName: "Employee",
        email: "newhire.employee@cyethack.com",
        personalEmail: "newhire.personal@gmail.com",
        phone: "+91 99999 88888",
        gender: "Male",
        dateOfBirth: "1995-06-15",
        address: "123 Street, Noida",
        emergencyContact: "Spouse +91 99999 77777",
        department: "Engineering",
        designation: "Software Engineer",
        employmentType: "Full-time",
        workMode: "Hybrid",
        workLocation: "office",
        bloodGroup: "B+",
        location: "Noida",
        joiningDate: "2026-12-01",
        salary: 800000,
        grade: "E2",
        status: "Active",
      },
    });
    ok("2. HR create employee → 201", create.status === 201, JSON.stringify(create.body));
    const newEmp = create.body.employee || {};
    ok("3. employeeId auto-generated", /^CY\d{4}[A-Z]{2}\d{3}$/.test(newEmp.employeeId || ""));
    ok("4. credentials returned", !!create.body.credentials && typeof create.body.credentials.username === "string");
    ok("5. username generated from email prefix", /^newhireemployee\d*$/.test(create.body.credentials.username || ""));
    ok("6. tempPassword returned once", typeof create.body.credentials.tempPassword === "string" && create.body.credentials.tempPassword.length >= 10);
    ok("7. welcomeText returned", typeof create.body.welcomeText === "string" && create.body.welcomeText.length > 0);
    ok("8. welcomeText contains company name", create.body.welcomeText.includes("CYETHACK Solution"));
    ok("9. welcomeText contains employee name", create.body.welcomeText.includes("New Hire Employee"));
    ok("10. welcomeText contains employeeId", create.body.welcomeText.includes(newEmp.employeeId));
    ok("11. welcomeText contains username", create.body.welcomeText.includes(create.body.credentials.username));
    ok("12. welcomeText contains temp password", create.body.welcomeText.includes(create.body.credentials.tempPassword));
    ok("13. welcomeText contains portal URL", create.body.welcomeText.includes("http://localhost:5000"));
    ok("14. welcomeText contains joining date", create.body.welcomeText.includes("2026-12-01") || create.body.welcomeText.includes("Dec"));
    ok("15. welcomeText contains role/dept", create.body.welcomeText.includes("Software Engineer") && create.body.welcomeText.includes("Engineering"));
    ok("16. no account wrapper in response", !create.body.account);
    ok("17. no activationToken in response", !create.body.activationToken);
    ok("18. no creator wrapper in response", !create.body.creator);
    ok("19. offer letter generated", !!create.body.offerLetter);
    ok("20. offer letter has referenceId", create.body.offerLetter && !!create.body.offerLetter.referenceId);

    const newEmpId = newEmp.employeeId;
    const tempPassword = create.body.credentials.tempPassword;

    // ============ No orphan records (bidirectional refs) ============
    const empDoc = await Employee.findOne({ employeeId: newEmpId });
    ok("21. Employee record in MongoDB", !!empDoc);
    ok("22. employee.user linked", !!empDoc && !!empDoc.user);
    ok("23. employee.userId stored", !!empDoc && !!empDoc.userId);
    ok("24. employee.createdBy set", !!empDoc && !!empDoc.createdBy);
    ok("25. employee.createdByRole set", !!empDoc && empDoc.createdByRole === 'HR');
    const userDoc = await User.findOne({ employeeId: newEmpId }).select('+passwordHash');
    ok("26. User record in MongoDB", !!userDoc);
    ok("27. passwordHash stored (bcrypt, not plaintext)", !!userDoc && typeof userDoc.passwordHash === 'string' && userDoc.passwordHash.length > 0 && /^\$2[aby]\$/.test(userDoc.passwordHash));
    ok("28. user.accountStatus pending-activation", userDoc && userDoc.accountStatus === 'pending-activation');
    ok("29. user.mustChangePassword true", userDoc && userDoc.mustChangePassword === true);
    ok("30. user.role EMPLOYEE", userDoc && userDoc.role === 'EMPLOYEE');
    ok("31. user.username set", !!userDoc && userDoc.username === create.body.credentials.username);
    ok("32. bidirectional emp.user ↔ user._id", empDoc && userDoc && String(empDoc.user) === String(userDoc._id));
    ok("33. bidirectional user.employeeId ↔ emp.employeeId", empDoc && userDoc && userDoc.employeeId === newEmpId);
    ok("34. no plaintext password in response", !JSON.stringify(create.body).toLowerCase().includes("passwordhash"));

    // ============ Offer letter document ============
    const offerDoc = await Document.findOne({ employee: empDoc._id, type: 'Offer Letter' });
    ok("35. Offer letter Document record", !!offerDoc);
    ok("36. Offer letter storageProvider set", !!offerDoc && !!offerDoc.storageProvider);

    // ============ Duplicate email rejected (409), no orphan ============
    const dupEmail = await apiJson("POST", "/api/employees", {
      access: hr.access,
      body: {
        fullName: "Duplicate Email",
        email: "newhire.employee@cyethack.com",
        department: "Engineering",
        designation: "Engineer",
        joiningDate: "2026-12-01",
      },
    });
    ok("37. duplicate email → 409", dupEmail.status === 409);
    // Verify no orphan: only one User record with this email
    const dupUsers = await User.countDocuments({ email: "newhire.employee@cyethack.com" });
    ok("38. no orphan user from duplicate email", dupUsers === 1);

    // ============ Employee cannot create employee (403) ============
    const empCreate = await apiJson("POST", "/api/employees", {
      access: empA.access,
      body: {
        fullName: "Unauthorized",
        email: "unauthorized@cyethack.com",
        department: "Engineering",
        designation: "Engineer",
        joiningDate: "2026-12-01",
      },
    });
    ok("39. employee cannot create → 403", empCreate.status === 403);

    // ============ Manager can create reporting employee ============
    const mgrCreate = await apiJson("POST", "/api/employees", {
      access: manager.access,
      body: {
        fullName: "Manager Hire",
        email: "mgrhire.employee@cyethack.com",
        department: "Engineering",
        designation: "Developer",
        manager: mgrDoc.employeeId,
        employmentType: "Full-time",
        joiningDate: "2026-12-01",
      },
    });
    ok("40. manager create reporting employee → 201", mgrCreate.status === 201, JSON.stringify(mgrCreate.body));
    if (mgrCreate.status === 201) {
      ok("41. manager create returns credentials", !!mgrCreate.body.credentials && !!mgrCreate.body.welcomeText);
    }

    // ============ Manager cannot create non-reporting employee ============
    const mgrCreate2 = await apiJson("POST", "/api/employees", {
      access: manager.access,
      body: {
        fullName: "Not Report",
        email: "notreport.employee@cyethack.com",
        department: "Engineering",
        designation: "Developer",
        manager: "CY9999XX999",
        employmentType: "Full-time",
        joiningDate: "2026-12-01",
      },
    });
    ok("42. manager non-report → 403", mgrCreate2.status === 403);

    // ============ Login accepts username (not just email) ============
    const usernameLogin = await login(create.body.credentials.username, tempPassword);
    ok("43. login with username → 200", usernameLogin.status === 200 && !!usernameLogin.access);
    ok("44. username login returns mustChangePassword", usernameLogin.user && usernameLogin.user.mustChangePassword === true);

    // ============ Forced password change flow ============
    // Change password with the temp password
    const changeRes = await apiJson("POST", "/api/auth/change-password", {
      access: usernameLogin.access,
      body: { currentPassword: tempPassword, newPassword: "SecurePass123!" },
    });
    ok("45. change-password → 200", changeRes.status === 200, JSON.stringify(changeRes.body));
    // mustChangePassword cleared in DB
    const afterChange = await User.findOne({ employeeId: newEmpId });
    ok("46. mustChangePassword cleared after change", afterChange && afterChange.mustChangePassword === false);
    ok("47. user record still intact after change", afterChange && afterChange.email === `newhire.employee@cyethack.com`);
    // Temp password no longer works
    const badLogin = await login(create.body.credentials.username, tempPassword);
    ok("48. temp password rejected after change", badLogin.status === 401);
    // New password works
    const goodLogin = await login(create.body.credentials.username, "SecurePass123!");
    ok("49. new password login → 200", goodLogin.status === 200 && !!goodLogin.access);
    ok("50. new login mustChangePassword false", goodLogin.user && goodLogin.user.mustChangePassword !== true);

    // ============ Change password complexity enforcement ============
    const weakChange = await apiJson("POST", "/api/auth/change-password", {
      access: goodLogin.access,
      body: { currentPassword: "SecurePass123!", newPassword: "weak" },
    });
    ok("51. weak password rejected → 400", weakChange.status === 400);
    const noDigitChange = await apiJson("POST", "/api/auth/change-password", {
      access: goodLogin.access,
      body: { currentPassword: "SecurePass123!", newPassword: "OnlyLetters" },
    });
    ok("52. no-digit password rejected → 400", noDigitChange.status === 400);
    const noLetterChange = await apiJson("POST", "/api/auth/change-password", {
      access: goodLogin.access,
      body: { currentPassword: "SecurePass123!", newPassword: "12345678" },
    });
    ok("53. no-letter password rejected → 400", noLetterChange.status === 400);

    // ============ Reset credentials (HR-only) ============
    const resetRes = await apiJson("POST", `/api/employees/${newEmpId}/reset-credentials`, {
      access: hr.access,
    });
    ok("54. reset-credentials → 200", resetRes.status === 200, JSON.stringify(resetRes.body));
    if (resetRes.status === 200) {
      ok("55. reset returns tempPassword", typeof resetRes.body.tempPassword === "string" && resetRes.body.tempPassword.length >= 10);
      ok("56. reset returns welcomeText", typeof resetRes.body.welcomeText === "string" && resetRes.body.welcomeText.length > 0);
      ok("57. reset welcomeText contains new temp password", resetRes.body.welcomeText.includes(resetRes.body.tempPassword));
      ok("58. reset mustChangePassword true", resetRes.body.mustChangePassword === true);
      // Verify the new temp password works for login
      const resetLogin = await login(create.body.credentials.username, resetRes.body.tempPassword);
      ok("59. new temp password login → 200", resetLogin.status === 200 && !!resetLogin.access);
      ok("60. reset login mustChangePassword true", resetLogin.user && resetLogin.user.mustChangePassword === true);
    }

    // ============ Non-HR cannot reset credentials (403) ============
    const nonHrReset = await apiJson("POST", `/api/employees/${newEmpId}/reset-credentials`, {
      access: empA.access,
    });
    ok("61. employee cannot reset credentials → 403", nonHrReset.status === 403);

    // ============ Username uniqueness on collision ============
    // Create another employee with same email prefix → username should be suffixed
    const dupPrefix = await apiJson("POST", "/api/employees", {
      access: hr.access,
      body: {
        fullName: "New Hire Two",
        email: "newhire.employee2@cyethack.com",
        department: "Engineering",
        designation: "Developer",
        joiningDate: "2026-12-01",
      },
    });
    ok("62. second employee with similar email → 201", dupPrefix.status === 201);
    if (dupPrefix.status === 201) {
      // Username should be unique (different from first)
      ok("63. username differs on collision", dupPrefix.body.credentials.username !== create.body.credentials.username);
    }

    // ============ Activate account (setup path) ============
    // activationToken no longer returned at creation; calling without token should fail
    const activate = await apiJson("POST", "/api/auth/activate-account", {
      body: { activationToken: "", newPassword: "" },
    });
    ok("64. activate without token → 400", activate.status === 400);

    // ============ Concurrent employee creation → unique IDs ============
    await apiJson("POST", "/api/employees", {
      access: hr.access,
      body: { fullName: "Concurrent A", email: "conc.a@cyethack.com", department: "Engineering", designation: "Dev", joiningDate: "2026-12-01" },
    });
    const [r1, r2] = await Promise.all([
      apiJson("POST", "/api/employees", { access: hr.access, body: { fullName: "Concurrent B", email: "conc.b@cyethack.com", department: "Engineering", designation: "Dev", joiningDate: "2026-12-01" } }),
      apiJson("POST", "/api/employees", { access: hr.access, body: { fullName: "Concurrent C", email: "conc.c@cyethack.com", department: "Engineering", designation: "Dev", joiningDate: "2026-12-01" } }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    ok("65. concurrent creation: both 201", statuses[0] === 201 && statuses[1] === 201, JSON.stringify(statuses));
    const empIds = await Employee.find({ email: { $in: ["conc.b@cyethack.com", "conc.c@cyethack.com"] } }).distinct("employeeId");
    ok("66. concurrent IDs are unique", empIds.length === 2 && new Set(empIds).size === 2);

    // Cleanup
    await Employee.deleteMany({ email: { $regex: "@cyethack\\.com$" } });
    await User.deleteMany({ email: { $regex: "@cyethack\\.com$" } });

  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDB();
    await mem.stop();
  }

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  if (fails.length) console.log("Failed:\n - " + fails.join("\n - "));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
