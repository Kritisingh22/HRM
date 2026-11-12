/* Employee onboarding end-to-end test — REAL app + REAL MongoDB
 *
 * Covers:
 *   1. HR creates employee + user account (POST /api/employees)
 *   2. Employee ID auto-generated server-side
 *   3. Duplicate email rejected (409)
 *   4. Employee cannot create another employee (403)
 *   5. Manager can create a reporting employee
 *   6. Activation token returned; activate account (POST /api/auth/activate-account)
 *   7. New employee can log in with provisioned credentials
 *   8. Employee record persists (GET /api/employees/me)
 *   9. Offer letter generated and stored
 * 10. Concurrent employee creation → unique IDs
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";

const { MongoMemoryServer } = require("mongodb-memory-server");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; fails.push(name); console.log("FAIL " + name + (extra ? " — " + extra : "")); }
}
const PORT = 5097;
const BASE = "http://localhost:" + PORT;

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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

    // ---- 2. HR creates employee ----
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
    ok("4. activation token returned", !!create.body.activationToken);
    ok("5. account pending-activation", create.body.account && create.body.account.accountStatus === "pending-activation");
    ok("6. mustChangePassword true", create.body.account && create.body.account.mustChangePassword === true);
    ok("7. offer letter generated", !!create.body.offerLetter);
    ok("8. offer letter has referenceId", create.body.offerLetter && !!create.body.offerLetter.referenceId);

    const newEmpId = newEmp.employeeId;
    const activationToken = create.body.activationToken;

    // ---- verify MongoDB records ----
    const empDoc = await Employee.findOne({ employeeId: newEmpId });
    ok("9. Employee record in MongoDB", !!empDoc);
    ok("10. employee.user linked", !!empDoc && !!empDoc.user);
    ok("11. employee.userId stored", !!empDoc && !!empDoc.userId);
    ok("12. employee.createdBy set", !!empDoc && !!empDoc.createdBy);
    ok("13. employee.createdByRole set", !!empDoc && empDoc.createdByRole === 'HR');
    const userDoc = await User.findOne({ employeeId: newEmpId }).select('+passwordHash');
    ok("14. User record in MongoDB", !!userDoc);
    ok("15. passwordHash stored (not plaintext)", !!userDoc && typeof userDoc.passwordHash === 'string' && userDoc.passwordHash.length > 0);
    ok("16. user.accountStatus pending-activation", userDoc && userDoc.accountStatus === 'pending-activation');
    ok("17. user.mustChangePassword true", userDoc && userDoc.mustChangePassword === true);
    ok("18. user.role EMPLOYEE", userDoc && userDoc.role === 'EMPLOYEE');

    // ---- verify offer letter document ----
    const offerDoc = await Document.findOne({ employee: empDoc._id, type: 'Offer Letter' });
    ok("19. Offer letter Document record", !!offerDoc);
    ok("20. Offer letter storageProvider set", !!offerDoc && !!offerDoc.storageProvider);

    // ---- 11. duplicate email rejected ----
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
    ok("11. duplicate email → 409", dupEmail.status === 409);

    // ---- 12. employee cannot create employee (403) ----
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
    ok("12. employee cannot create → 403", empCreate.status === 403);

    // ---- 13. manager can create reporting employee ----
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
    ok("13. manager create reporting employee → 201", mgrCreate.status === 201, JSON.stringify(mgrCreate.body));

    // ---- 14. manager cannot create non-reporting employee ----
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
    ok("14. manager non-report → 403", mgrCreate2.status === 403);

    // ---- 15. activate account ----
    const activate = await apiJson("POST", "/api/auth/activate-account", {
      body: { activationToken, newPassword: "SecurePass123!" },
    });
    ok("15. activate account → 200", activate.status === 200, JSON.stringify(activate.body));
    ok("16. activation response ok", activate.body.ok === true);

    // ---- 16. new employee can log in ----
    const newLogin = await login("newhire.employee@cyethack.com", "SecurePass123!");
    ok("17. new employee login → 200", newLogin.status === 200 && !!newLogin.access);
    ok("18. new login user role EMPLOYEE", newLogin.user && newLogin.user.role === 'EMPLOYEE');
    ok("19. new login user employeeId", newLogin.user && newLogin.user.employeeId === newEmpId);

    // ---- 20. employee persists after "refresh" (GET /api/employees, scoped to self) ----
    const me = await apiJson("GET", "/api/employees", { access: newLogin.access });
    ok("20. GET /api/employees → 200", me.status === 200);
    ok("21. me returns employee", !!me.body && !!me.body.employees && me.body.employees.length === 1 && me.body.employees[0].employeeId === newEmpId);

    // ---- 21. concurrent employee creation → unique IDs ----
    await apiJson("POST", "/api/employees", {
      access: hr.access,
      body: { fullName: "Concurrent A", email: "conc.a@cyethack.com", department: "Engineering", designation: "Dev", joiningDate: "2026-12-01" },
    });
    const [r1, r2] = await Promise.all([
      apiJson("POST", "/api/employees", { access: hr.access, body: { fullName: "Concurrent B", email: "conc.b@cyethack.com", department: "Engineering", designation: "Dev", joiningDate: "2026-12-01" } }),
      apiJson("POST", "/api/employees", { access: hr.access, body: { fullName: "Concurrent C", email: "conc.c@cyethack.com", department: "Engineering", designation: "Dev", joiningDate: "2026-12-01" } }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    ok("21. concurrent creation: both 201", statuses[0] === 201 && statuses[1] === 201, JSON.stringify(statuses));
    const empIds = await Employee.find({ email: { $in: ["conc.b@cyethack.com", "conc.c@cyethack.com"] } }).distinct("employeeId");
    ok("22. concurrent IDs are unique", empIds.length === 2 && new Set(empIds).size === 2);

  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDB();
    await mem.stop();
  }

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  if (fails.length) console.log("Failed:\n - " + fails.join("\n - "));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
