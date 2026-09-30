/* End-to-end tests against a REAL MongoDB (mongodb-memory-server) and the real
 * Express app. Run with:  npm test
 * Covers authentication, refresh rotation, RBAC, object-level authorization,
 * protected routes, module CRUD, and security properties. */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";

const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");

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

const PORT = 5099;
const BASE = "http://localhost:" + PORT;

function getRefreshCookie(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const c = arr.find((s) => s.startsWith("cyethack_refresh="));
  return c || null;
}
function cookiePair(setCookie) {
  return setCookie ? setCookie.split(";")[0] : null;
}

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const sc = getRefreshCookie(res);
  return {
    status: res.status,
    body,
    setCookie: sc,
    cookie: cookiePair(sc),
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
async function apiForm(method, path, { access, form } = {}) {
  const headers = {};
  if (access) headers["Authorization"] = "Bearer " + access;
  const res = await fetch(BASE + path, { method, headers, body: form }); // fetch sets multipart boundary
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
  const User = require("../models/User");
  const Employee = require("../models/Employee");
  const { provisionUsers } = require("../seeds/provision-real-users");
  const realProvisionAccounts = DEV_USERS.filter(
    (user) => user.employeeId && user.employeeId.startsWith("CY"),
  ).map(({ employeeId, fullName, role, email, password }) => ({
    employeeId,
    fullName,
    role,
    email,
    password,
  }));
  const existingProvision = await provisionUsers(realProvisionAccounts);
  ok(
    "0a. explicit provisioner preserves existing account hashes and identities",
    existingProvision.length === 6 &&
      existingProvision.every(
        (account) => account.status === "existing hash preserved",
      ) &&
      (await User.countDocuments()) === DEV_USERS.length,
  );

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    // ============ HEALTH ENDPOINT (host platform readiness probe) ============
    const health = await api("GET", "/api/health");
    ok(
      "170. GET /api/health needs no auth → 200 { status: ok }",
      health.status === 200 && health.data.status === "ok",
    );
    ok(
      "171. /api/health reports the live MongoDB connection state",
      health.data.database === "connected",
    );
    ok(
      "172. /api/health leaks no host, db name, URI or credentials",
      !/mongodb/i.test(JSON.stringify(health.data)) &&
        !/as0bfdl|onrender|:\/\//i.test(JSON.stringify(health.data)) &&
        !/password|secret|token/i.test(JSON.stringify(health.data)),
    );

    // ============ M3: strict Content-Security-Policy on the served portal ============
    const cspRes = await fetch(BASE + "/");
    const csp = cspRes.headers.get("content-security-policy") || "";
    const scriptSrc = (csp.match(/script-src ([^;]*)/) || [null, ""])[1];
    ok("144. CSP header present on the served portal", csp.length > 0);
    ok(
      "145. script-src is 'self' with NO 'unsafe-inline' (M3 core fix)",
      /'self'/.test(scriptSrc) && !/unsafe-inline/.test(scriptSrc),
    );
    ok("146. script-src has NO 'unsafe-eval'", !/unsafe-eval/.test(scriptSrc));
    ok(
      "147. inline event handlers blocked (script-src-attr 'none')",
      /script-src-attr 'none'/.test(csp),
    );
    ok(
      "148. connect-src restricted to 'self' (same-origin API only)",
      /connect-src [^;]*'self'/.test(csp) && !/connect-src[^;]*\*/.test(csp),
    );
    ok(
      "149. object-src 'none' (no plugins/embeds)",
      /object-src 'none'/.test(csp),
    );

    // ============ AUTHENTICATION ============
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok("1. valid login → 200", hr.status === 200);
    ok(
      "7. access token generated",
      typeof hr.access === "string" && hr.access.length > 20,
    );
    ok(
      "   refresh cookie set + HttpOnly",
      !!hr.setCookie && /HttpOnly/i.test(hr.setCookie),
    );
    ok(
      "36. login response has no passwordHash",
      !JSON.stringify(hr.body).toLowerCase().includes("passwordhash"),
    );

    const badEmail = await login("nobody@cyethack.com", "whatever1");
    ok(
      "2. unknown email → 401 generic",
      badEmail.status === 401 &&
        /invalid email or password/i.test(badEmail.body.error),
    );
    const badPass = await login("jaya.sahu@cyethack.com", "wrongpass");
    ok(
      "3. invalid password → 401 generic",
      badPass.status === 401 &&
        /invalid email or password/i.test(badPass.body.error),
    );
    ok(
      "39. same generic message (no user enumeration)",
      badEmail.body.error === badPass.body.error,
    );

    await User.collection.insertOne({
      fullName: "Legacy Account Without Password Hash",
      email: "legacy-no-hash@cyethack.com",
      role: "EMPLOYEE",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const missingHash = await login(
      "legacy-no-hash@cyethack.com",
      "LegacyPassword@1",
    );
    ok(
      "39a. account missing passwordHash fails safely with generic 401",
      missingHash.status === 401 &&
        missingHash.body.error === badPass.body.error,
    );
    await provisionUsers([
      {
        employeeId: "LEGACY-001",
        fullName: "Legacy Account Without Password Hash",
        email: "legacy-no-hash@cyethack.com",
        role: "EMPLOYEE",
        department: "Engineering",
        designation: "Analyst",
        manager: "CY0824SD301",
        assignedHrId: "CY0125JS201",
        joiningDate: "2026-01-01",
        password: "LegacyPassword@1",
      },
    ]);
    const repairedLegacyLogin = await login(
      "legacy-no-hash@cyethack.com",
      "LegacyPassword@1",
    );
    const repairedLegacy = await User.findOne({
      email: "legacy-no-hash@cyethack.com",
    }).select("+passwordHash");
    const linkedLegacyEmployee = await Employee.findOne({
      employeeId: "LEGACY-001",
    });
    ok(
      "39b. explicit provisioning repairs a missing legacy password hash",
      repairedLegacyLogin.status === 200 &&
        /^\$2[aby]\$/.test(repairedLegacy.passwordHash) &&
        !!linkedLegacyEmployee &&
        String(linkedLegacyEmployee.user) === String(repairedLegacy._id) &&
        linkedLegacyEmployee.assignedHrId === "CY0125JS201",
    );
    // LEGACY-001 is a throwaway fixture, but it is linked to the real HR and the
    // real manager — leaving it behind would silently shift the seeded roster
    // counts the RBAC scope tests below assert on. Remove it now that it has
    // proven the repair works.
    await Employee.deleteOne({ _id: linkedLegacyEmployee._id });
    await User.deleteOne({ _id: repairedLegacy._id });

    const empty = await api("POST", "/api/auth/login", {
      body: { email: "", password: "" },
    });
    ok("4. empty credentials → 400", empty.status === 400);

    // JWT validation
    const me = await api("GET", "/api/auth/me", { access: hr.access });
    ok(
      "8. JWT validated → /me 200",
      me.status === 200 && me.data.user.email === "jaya.sahu@cyethack.com",
    );
    ok(
      "37. /me has no passwordHash",
      !JSON.stringify(me.data).toLowerCase().includes("passwordhash"),
    );

    // expired access token
    const expired = jwt.sign(
      { sub: String(me.data.user.id), role: "HR" },
      process.env.JWT_SECRET,
      { expiresIn: "-10s" },
    );
    const expRes = await api("GET", "/api/auth/me", { access: expired });
    ok("9/27. expired access token → 401", expRes.status === 401);

    // ============ REFRESH ROTATION ============
    const ref1 = await fetch(BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: hr.cookie },
    });
    const ref1Body = await ref1.json();
    const newCookie = cookiePair(getRefreshCookie(ref1));
    ok(
      "10. refresh → new access token",
      ref1.status === 200 && typeof ref1Body.accessToken === "string",
    );
    ok("   refresh rotated the cookie", !!newCookie && newCookie !== hr.cookie);

    // reuse of the OLD (now rotated) refresh token must fail (rotation + reuse detection)
    const reuse = await fetch(BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: hr.cookie },
    });
    ok("12. reusing rotated refresh token → 401", reuse.status === 401);
    // and the reuse revokes the family → the new token is dead too
    const afterReuse = await fetch(BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: newCookie },
    });
    ok("   reuse revokes the whole family", afterReuse.status === 401);

    const badRef = await fetch(BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: "cyethack_refresh=bogus" },
    });
    ok("11. invalid refresh token → 401", badRef.status === 401);

    // logout revokes
    const hr2 = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    const lo = await fetch(BASE + "/api/auth/logout", {
      method: "POST",
      headers: { Cookie: hr2.cookie },
    });
    ok("13. logout → 200", lo.status === 200);
    const afterLogout = await fetch(BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: hr2.cookie },
    });
    ok("   logout revoked the refresh token", afterLogout.status === 401);

    // inactive + locked accounts (throwaway users)
    await User.create({
      fullName: "Inactive User",
      email: "inactive@cyethack.com",
      role: "EMPLOYEE",
      status: "inactive",
      password: "Inactive@1",
    });
    const inact = await login("inactive@cyethack.com", "Inactive@1");
    ok("5. inactive account → 403", inact.status === 403);

    await User.create({
      fullName: "Lock User",
      email: "lock@cyethack.com",
      role: "EMPLOYEE",
      status: "active",
      password: "Lock@123",
    });
    for (let i = 0; i < 5; i++) await login("lock@cyethack.com", "nope" + i);
    const locked = await login("lock@cyethack.com", "Lock@123"); // correct pw, but locked
    ok("6. account locks after repeated failures → 423", locked.status === 423);

    // ============ RBAC + OBJECT-LEVEL ============
    const emp = await login("rohith.sai@cyethack.com", "GangCY0525RS109"); // CY0525RS109
    const mgr = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301"); // CY0824SD301 manages CY0226AR110, CY0626AD111, CY0726SS112
    const admin = await login("admin@cyethack.com", "Admin@123");

    const empList = await api("GET", "/api/employees", { access: emp.access });
    ok(
      "15. employee sees only own record (scoped)",
      empList.status === 200 &&
        empList.data.count === 1 &&
        empList.data.employees[0].employeeId === "CY0525RS109",
    );
    const hrList = await api("GET", "/api/employees", { access: hr.access });
    ok(
      "20. HR sees assigned employees only",
      hrList.status === 200 &&
        hrList.data.count === 6 &&
        hrList.data.employees.every(
          (e) =>
            e.assignedHrId === "CY0125JS201" || e.employeeId === "CY0125JS201",
        ),
    );
    const mgrList = await api("GET", "/api/employees", { access: mgr.access });
    ok(
      "18. manager sees team + self",
      mgrList.status === 200 && mgrList.data.count === 4,
    );

    const empWrite = await api("POST", "/api/employees", {
      access: emp.access,
      body: { employeeId: "CY9999", fullName: "X" },
    });
    ok("16. employee cannot create employee → 403", empWrite.status === 403);
    const empHiring = await api("GET", "/api/hiring", { access: emp.access });
    ok("17. employee cannot read hiring → 403", empHiring.status === 403);

    // object-level: employee accessing someone else's record
    const otherEmp = await api("GET", "/api/employees/CY0824SD301", {
      access: emp.access,
    });
    ok("23. employee GET another employee → 403", otherEmp.status === 403);
    const ownEmp = await api("GET", "/api/employees/CY0525RS109", {
      access: emp.access,
    });
    ok("    employee GET own record → 200", ownEmp.status === 200);
    // §28: unauthorized / unknown responses are a SAFE envelope — friendly message, no stack trace / internals
    ok(
      "165. 403 body is a safe envelope (friendly error, no stack trace)",
      typeof otherEmp.data.error === "string" &&
        otherEmp.data.error.length > 0 &&
        !("stack" in otherEmp.data) &&
        !/\.js:\d|\bat \//i.test(JSON.stringify(otherEmp.data)),
    );
    const bogus = await api("GET", "/api/this-route-does-not-exist", {
      access: emp.access,
    });
    ok(
      "166. unknown API route → 404 safe envelope (no stack)",
      bogus.status === 404 &&
        typeof bogus.data.error === "string" &&
        !("stack" in bogus.data),
    );
    // §17/§18: employee self-service edits ONLY own allow-listed fields — privileged
    // fields sent in the body are ignored, and it acts on the caller's OWN record.
    const selfUpd = await api("PUT", "/api/employees/me/profile", {
      access: emp.access,
      body: {
        phone: "+91 99999 00008",
        address: "Test Addr",
        emergencyContact: "Kin 90000",
        department: "Finance",
        salary: 999999,
        role: "ADMIN",
        status: "Exited",
      },
    });
    ok(
      "167. employee self-updates own contact fields → 200",
      selfUpd.status === 200 &&
        selfUpd.data.employee.employeeId === "CY0525RS109" &&
        selfUpd.data.employee.phone === "+91 99999 00008" &&
        selfUpd.data.employee.address === "Test Addr",
    );
    ok(
      "168. self-update ignores privileged fields (dept/salary/role/status)",
      selfUpd.data.employee.department === "Engineering" &&
        selfUpd.data.employee.status === "Active" &&
        !("salary" in selfUpd.data.employee),
    );

    // object-level payroll
    const payList = await api("GET", "/api/payroll", { access: emp.access });
    ok(
      "    employee payroll list scoped to self",
      payList.status === 200 &&
        payList.data.payroll.every(
          (p) => p.employee.employeeId === "CY0525RS109",
        ),
    );
    // find a payslip that is NOT the employee's (CY0226AR110's) as HR, then try as employee
    const allPay = await api("GET", "/api/payroll", { access: hr.access });
    const foreign = allPay.data.payroll.find(
      (p) => p.employee.employeeId !== "CY0525RS109",
    );
    const foreignPay = await api("GET", "/api/payroll/" + foreign._id, {
      access: emp.access,
    });
    ok("24. employee GET another payslip → 403", foreignPay.status === 403);

    // ============ PROTECTED ROUTES ============
    const noTok = await api("GET", "/api/employees");
    ok("25. protected route without token → 401", noTok.status === 401);
    const badTok = await api("GET", "/api/employees", { access: "not.a.jwt" });
    ok("26. invalid token → 401", badTok.status === 401);

    // ============ MODULE CRUD ============
    const created = await api("POST", "/api/employees", {
      access: hr.access,
      body: {
        employeeId: "CY0100",
        fullName: "New Hire",
        department: "Engineering",
      },
    });
    ok(
      "21/30. HR create employee → 201",
      created.status === 201 && created.data.employee.employeeId === "CY0100",
    );
    const updated = await api("PUT", "/api/employees/CY0100", {
      access: hr.access,
      body: { designation: "QA Engineer" },
    });
    ok(
      "    HR update employee",
      updated.status === 200 &&
        updated.data.employee.designation === "QA Engineer",
    );
    const deleted = await api("DELETE", "/api/employees/CY0100", {
      access: hr.access,
    });
    ok("    HR delete employee", deleted.status === 200);

    // leave: employee files own; manager approves team member's; manager CANNOT approve non-team
    const filed = await api("POST", "/api/leaves", {
      access: emp.access,
      body: {
        type: "Casual Leave",
        from: "2026-11-01",
        to: "2026-11-02",
        days: 2,
        reason: "Trip",
      },
    });
    ok("31. employee files own leave → 201", filed.status === 201);
    const leaves = await api("GET", "/api/leaves", { access: hr.access });
    const teamPending = leaves.data.leaves.find(
      (l) =>
        l.employee &&
        l.employee.employeeId === "CY0226AR110" &&
        l.status === "Pending",
    );
    const mgrApprove = await api("PUT", "/api/leaves/" + teamPending._id, {
      access: mgr.access,
      body: { status: "Approved" },
    });
    ok(
      "19. manager approves TEAM leave → 200",
      mgrApprove.status === 200 && mgrApprove.data.leave.status === "Approved",
    );
    const empPending = leaves.data.leaves.find(
      (l) =>
        l.employee &&
        l.employee.employeeId === "CY0525RS109" &&
        l.status === "Pending",
    );
    const mgrApproveForeign = await api(
      "PUT",
      "/api/leaves/" + empPending._id,
      { access: mgr.access, body: { status: "Approved" } },
    );
    ok(
      "19b. manager cannot approve NON-team leave → 403",
      mgrApproveForeign.status === 403,
    );

    // attendance
    const att = await api("POST", "/api/attendance", {
      access: hr.access,
      body: {
        employee: (
          await api("GET", "/api/employees/CY0525RS109", { access: hr.access })
        ).data.employee._id,
        date: "2026-09-11",
        status: "present",
      },
    });
    ok("32. HR upserts attendance → 201", att.status === 201);
    const empAtt = await api("GET", "/api/attendance", { access: emp.access });
    ok("    employee reads own attendance", empAtt.status === 200);

    // payroll create
    const payCreate = await api("POST", "/api/payroll", {
      access: hr.access,
      body: {
        employee: foreign.employee._id,
        period: "2026-09",
        gross: 70000,
        deductions: { pf: 4200, tds: 4000 },
      },
    });
    ok(
      "33. HR creates payroll → 201 with computed net",
      payCreate.status === 201 && payCreate.data.payslip.net === 70000 - 8200,
    );

    const hrBUser = new User({
      fullName: "HR B",
      email: "hr-b@cyethack.com",
      employeeId: "CY9998HRB",
      role: "HR",
      status: "active",
    });
    hrBUser.password = "HrBPassword@1";
    await hrBUser.save();
    const hrBEmployee = await Employee.create({
      employeeId: "CY9998HRB",
      user: hrBUser._id,
      fullName: "HR B",
      email: "hr-b@cyethack.com",
      department: "Human Resources",
      assignedHrId: "CY9998HRB",
      salary: 60000,
      status: "Active",
    });
    const hrBStaff = await Employee.create({
      employeeId: "CY9999HRB",
      fullName: "HR B Assigned Staff",
      department: "Operations",
      designation: "Analyst",
      assignedHrId: "CY9998HRB",
      salary: 88000,
      status: "Active",
    });
    const hrB = await login("hr-b@cyethack.com", "HrBPassword@1");
    const generatedPayroll = await api("POST", "/api/payroll/generate", {
      access: hrB.access,
      body: { period: "2027-01" },
    });
    const generatedRecord = generatedPayroll.data.payroll?.find(
      (row) => String(row.employee) === String(hrBStaff._id),
    );
    ok(
      "33a. HR generates payroll from assigned employee salary",
      generatedPayroll.status === 201 &&
        generatedPayroll.data.count === 2 &&
        !!generatedRecord &&
        generatedRecord.basic === 44000 &&
        generatedRecord.gross === 88000 &&
        generatedRecord.net === 87800 &&
        generatedRecord.assignedHrId === "CY9998HRB",
    );
    const hrBPayroll = await api("GET", "/api/payroll", {
      access: hrB.access,
    });
    const hrAPayroll = await api("GET", "/api/payroll", {
      access: hr.access,
    });
    const hrAIdor = await api("GET", "/api/payroll?employee=" + hrBStaff._id, {
      access: hr.access,
    });
    ok(
      "33b. HR-B payroll persists and HR-A cannot read it",
      hrBPayroll.status === 200 &&
        hrBPayroll.data.payroll.some(
          (row) => row.employee.employeeId === "CY9999HRB",
        ) &&
        !hrAPayroll.data.payroll.some(
          (row) => row.employee.employeeId === "CY9999HRB",
        ) &&
        hrAIdor.status === 403,
    );
    const generatedId = generatedRecord && generatedRecord._id;
    const salaryUpdate = await api("PUT", "/api/payroll/" + generatedId, {
      access: hrB.access,
      body: {
        basic: 46000,
        allowances: { hra: 18000, conveyance: 1600, special: 24400 },
        bonus: 1000,
        overtime: 2000,
        deductions: { professionalTax: 200, loanAdvance: 1000 },
      },
    });
    const refreshedPayroll = await api("GET", "/api/payroll", {
      access: hrB.access,
    });
    const refreshedRecord = refreshedPayroll.data.payroll.find(
      (row) => row._id === generatedId,
    );
    ok(
      "33c. edited salary persists and reload returns updated values",
      salaryUpdate.status === 200 &&
        refreshedRecord.basic === 46000 &&
        refreshedRecord.bonus === 1000 &&
        refreshedRecord.overtime === 2000 &&
        refreshedRecord.gross === 93000 &&
        refreshedRecord.net === 91800,
    );
    const hrACrossDetail = await api(
      "GET",
      "/api/payroll/" + generatedId + "/payslip",
      { access: hr.access },
    );
    ok(
      "33d. HR-A cannot access HR-B payslip by direct ID",
      hrACrossDetail.status === 403,
    );
    const hrASelectedGenerate = await api(
      "POST",
      "/api/payroll/employee/CY9999HRB/generate",
      { access: hr.access, body: { period: "2027-03" } },
    );
    ok(
      "33h. HR-A cannot generate payroll for HR-B's selected employee",
      hrASelectedGenerate.status === 403,
    );

    await User.updateOne(
      { email: "surya.dwivedi@cyethack.com" },
      { permissions: ["payroll:write"] },
    );
    const managerWriteOnlyGenerate = await api(
      "POST",
      "/api/payroll/generate",
      {
        access: mgr.access,
        body: { period: "2027-04" },
      },
    );
    const managerWriteOnlySelected = await api(
      "POST",
      "/api/payroll/employee/CY0226AR110/generate",
      { access: mgr.access, body: { period: "2027-04" } },
    );
    const managerWriteOnlyAnalytics = await api(
      "GET",
      "/api/analytics/overview",
      { access: mgr.access },
    );
    ok(
      "33j. Manager payroll:write alone cannot read team payroll data",
      managerWriteOnlyGenerate.status === 403 &&
        managerWriteOnlySelected.status === 403 &&
        managerWriteOnlyAnalytics.status === 200 &&
        managerWriteOnlyAnalytics.data.payrollByStatus.length === 0,
    );

    await User.updateOne(
      { email: "surya.dwivedi@cyethack.com" },
      { permissions: ["payroll:read", "payroll:write"] },
    );
    const managerPayroll = await api("GET", "/api/payroll", {
      access: mgr.access,
    });
    const managerCrossTeam = await api(
      "GET",
      "/api/payroll?employee=" + hrBStaff._id,
      { access: mgr.access },
    );
    const managerGenerated = await api("POST", "/api/payroll/generate", {
      access: mgr.access,
      body: { period: "2027-02" },
    });
    ok(
      "33e. Manager payroll access is team-only and explicitly permissioned",
      managerPayroll.status === 200 &&
        managerPayroll.data.payroll.some(
          (row) => row.employee.employeeId === "CY0226AR110",
        ) &&
        !managerPayroll.data.payroll.some(
          (row) => row.employee.employeeId === "CY9999HRB",
        ) &&
        managerCrossTeam.status === 403 &&
        managerGenerated.status === 201 &&
        managerGenerated.data.payroll.every(
          (row) => row.employee && row.employee.assignedHrId !== "CY9998HRB",
        ),
    );
    const managerTeamEmployee = await Employee.findOne({
      employeeId: "CY0226AR110",
    });
    const managerTeamSlip = managerGenerated.data.payroll.find(
      (row) => String(row.employee) === String(managerTeamEmployee._id),
    );
    const managerTeamEdit = await api(
      "PUT",
      "/api/payroll/" + managerTeamSlip._id,
      { access: mgr.access, body: { status: "Approved" } },
    );
    ok(
      "33f. explicitly authorized manager can update a team payroll record",
      managerTeamEdit.status === 200 &&
        managerTeamEdit.data.payslip.status === "Approved",
    );
    const managerSelectedGenerate = await api(
      "POST",
      "/api/payroll/employee/CY0226AR110/generate",
      { access: mgr.access, body: { period: "2027-03" } },
    );
    const managerOutOfTeamGenerate = await api(
      "POST",
      "/api/payroll/employee/CY9999HRB/generate",
      { access: mgr.access, body: { period: "2027-03" } },
    );
    ok(
      "33i. manager selected payslip generates for team member only",
      managerSelectedGenerate.status === 201 &&
        String(managerSelectedGenerate.data.payslip.employee) ===
          String(managerTeamEmployee._id) &&
        managerOutOfTeamGenerate.status === 403,
    );
    const adminManagementPay = await api(
      "GET",
      "/api/payroll?employee=" +
        (await Employee.findOne({ employeeId: "CY0824SD301" }))._id,
      { access: admin.access },
    );
    ok(
      "33g. admin employee filter cannot bypass Management payroll exclusion",
      adminManagementPay.status === 403,
    );

    // hiring
    const hire = await api("POST", "/api/hiring", {
      access: hr.access,
      body: {
        jobId: "JOB-200",
        title: "DevOps Engineer",
        department: "Engineering",
      },
    });
    ok("34. HR creates hiring → 201", hire.status === 201);
    const hireList = await api("GET", "/api/hiring", { access: hr.access });
    ok(
      "    HR lists hiring",
      hireList.status === 200 && hireList.data.count >= 3,
    );

    // reports
    const rep = await api("GET", "/api/reports/summary", { access: hr.access });
    ok(
      "35. HR reports summary → metrics (company-wide)",
      rep.status === 200 &&
        typeof rep.data.metrics.headcount === "number" &&
        rep.data.scope === "company",
    );
    const empRep = await api("GET", "/api/reports/summary", {
      access: emp.access,
    });
    ok("    employee cannot read reports → 403", empRep.status === 403);
    const mgrRep = await api("GET", "/api/reports/summary", {
      access: mgr.access,
    });
    ok(
      "    manager reports scoped to team",
      mgrRep.status === 200 && mgrRep.data.scope === "team",
    );
    // M1: manager report metrics must be TEAM-only, never company-wide
    ok(
      "35a. manager reports headcount is team-only (< company)",
      mgrRep.data.metrics.headcount < rep.data.metrics.headcount,
    );
    ok(
      "35b. manager reports pendingLeaves are team-only (< company)",
      mgrRep.data.metrics.pendingLeaves < rep.data.metrics.pendingLeaves,
    );
    ok(
      "35c. manager reports openPositions do not leak company-wide",
      mgrRep.data.metrics.openPositions < rep.data.metrics.openPositions,
    );

    // ============ USERS / REGISTRATION / PASSWORD ============
    const empUsers = await api("GET", "/api/users", { access: emp.access });
    ok("41. employee cannot list users → 403", empUsers.status === 403);
    const adminUsers = await api("GET", "/api/users", { access: admin.access });
    ok(
      "42. admin lists users",
      adminUsers.status === 200 && adminUsers.data.count >= 5,
    );
    const reg = await api("POST", "/api/users", {
      access: admin.access,
      body: {
        fullName: "New Staff",
        email: "newstaff@cyethack.com",
        password: "NewStaff@1",
        role: "EMPLOYEE",
      },
    });
    ok(
      "43. admin registers a new user → 201",
      reg.status === 201 && reg.data.user.email === "newstaff@cyethack.com",
    );
    const empReg = await api("POST", "/api/users", {
      access: emp.access,
      body: { fullName: "X", email: "x@y.com", password: "Xxxxxxx1" },
    });
    ok("44. employee cannot create users → 403", empReg.status === 403);
    const newLogin = await login("newstaff@cyethack.com", "NewStaff@1");
    ok("45. newly registered user can log in", newLogin.status === 200);
    const cpWrong = await api("POST", "/api/auth/change-password", {
      access: newLogin.access,
      body: { currentPassword: "nope", newPassword: "Changed@123" },
    });
    ok("46. change-password wrong current → 401", cpWrong.status === 401);
    const cpOk = await api("POST", "/api/auth/change-password", {
      access: newLogin.access,
      body: { currentPassword: "NewStaff@1", newPassword: "Changed@123" },
    });
    ok("47. change-password succeeds", cpOk.status === 200);
    const reLogin = await login("newstaff@cyethack.com", "Changed@123");
    ok("48. login works with the new password", reLogin.status === 200);
    const boot = await api("POST", "/api/auth/bootstrap-admin", {
      body: { fullName: "Root", email: "root@x.com", password: "Rootpass1" },
    });
    ok(
      "49. bootstrap-admin refused when users exist → 403",
      boot.status === 403,
    );
    const hrCreate = await api("POST", "/api/users", {
      access: hr.access,
      body: {
        fullName: "HR Made",
        email: "hrmade@cyethack.com",
        password: "HrMade@12",
        role: "EMPLOYEE",
      },
    });
    ok(
      "49b. HR can provision a non-admin account → 201",
      hrCreate.status === 201,
    );
    const hrEscalate = await api("POST", "/api/users", {
      access: hr.access,
      body: {
        fullName: "Bad",
        email: "bad@cyethack.com",
        password: "BadPass12",
        role: "ADMIN",
      },
    });
    ok(
      "49c. HR cannot create an ADMIN account (no escalation) → 403",
      hrEscalate.status === 403,
    );

    // ============ PERFORMANCE / PROJECTS ============
    const emp8 = (
      await api("GET", "/api/employees/CY0525RS109", { access: hr.access })
    ).data.employee;
    const empPerf = await api("GET", "/api/performance", {
      access: emp.access,
    });
    ok(
      "50. employee sees own performance only",
      empPerf.status === 200 &&
        empPerf.data.performance.every(
          (p) => p.employee.employeeId === "CY0525RS109",
        ),
    );
    const perfCreate = await api("POST", "/api/performance", {
      access: hr.access,
      body: { employee: emp8._id, cycle: "2026-H2", rating: 5 },
    });
    ok("51. HR creates a performance review → 201", perfCreate.status === 201);
    const empPerfWrite = await api("POST", "/api/performance", {
      access: emp.access,
      body: { employee: emp8._id, cycle: "2027-H1" },
    });
    ok(
      "52. employee cannot write performance → 403",
      empPerfWrite.status === 403,
    );
    const empProj = await api("GET", "/api/projects", { access: emp.access });
    ok(
      "53. employee sees only their projects",
      empProj.status === 200 &&
        empProj.data.projects.some((p) => p.projectId === "PRJ-002"),
    );
    const projCreate = await api("POST", "/api/projects", {
      access: hr.access,
      body: { projectId: "PRJ-100", name: "New Project" },
    });
    ok("54. HR creates a project → 201", projCreate.status === 201);

    // ============ DOCUMENTS (real upload / download + object-level) ============
    const fd = new FormData();
    fd.append(
      "file",
      new Blob(["hello confidential"], { type: "text/plain" }),
      "note.txt",
    );
    fd.append("title", "My Note");
    const up = await apiForm("POST", "/api/documents", {
      access: emp.access,
      form: fd,
    });
    ok(
      "55. employee uploads a document → 201 (forced private)",
      up.status === 201 && up.data.document.visibility === "private",
    );
    const dl = await fetch(
      BASE + "/api/documents/" + up.data.document._id + "/download",
      { headers: { Authorization: "Bearer " + emp.access } },
    );
    ok("56. owner downloads own document → 200", dl.status === 200);
    const dlForeign = await fetch(
      BASE + "/api/documents/" + up.data.document._id + "/download",
      { headers: { Authorization: "Bearer " + mgr.access } },
    );
    ok(
      "57. another user cannot download a private doc → 403",
      dlForeign.status === 403,
    );
    const hrDl = await fetch(
      BASE + "/api/documents/" + up.data.document._id + "/download",
      { headers: { Authorization: "Bearer " + hr.access } },
    );
    ok("58. HR can download any document → 200", hrDl.status === 200);
    const delDoc = await api(
      "DELETE",
      "/api/documents/" + up.data.document._id,
      { access: hr.access },
    );
    ok("59. HR deletes a document → 200", delDoc.status === 200);

    // ============ NOTICES / HELPDESK ============
    const empNotices = await api("GET", "/api/notices", { access: emp.access });
    ok(
      "60. employee sees published notices",
      empNotices.status === 200 && empNotices.data.notices.length >= 1,
    );
    const empNoticeWrite = await api("POST", "/api/notices", {
      access: emp.access,
      body: { title: "X", body: "Y" },
    });
    ok(
      "61. employee cannot post a notice → 403",
      empNoticeWrite.status === 403,
    );
    const noticeCreate = await api("POST", "/api/notices", {
      access: hr.access,
      body: { title: "Test Notice", body: "Hello" },
    });
    ok("62. HR posts a notice → 201", noticeCreate.status === 201);
    const tkt = await api("POST", "/api/helpdesk", {
      access: emp.access,
      body: { subject: "VPN issue", category: "IT" },
    });
    ok("63. employee raises a ticket → 201", tkt.status === 201);
    const empTickets = await api("GET", "/api/helpdesk", {
      access: emp.access,
    });
    ok(
      "64. employee sees own tickets only",
      empTickets.status === 200 &&
        empTickets.data.tickets.every(
          (t) =>
            String((t.raisedBy && t.raisedBy._id) || t.raisedBy) ===
            String(emp.user.id),
        ),
    );
    const hrTickets = await api("GET", "/api/helpdesk", { access: hr.access });
    ok(
      "65. support staff see all tickets",
      hrTickets.status === 200 && hrTickets.data.count >= empTickets.data.count,
    );
    const empResolve = await api(
      "PUT",
      "/api/helpdesk/" + tkt.data.ticket._id,
      { access: emp.access, body: { status: "Resolved" } },
    );
    ok("66. employee cannot resolve a ticket → 403", empResolve.status === 403);

    // ============ OFFBOARDING / ORG CHART / ANALYTICS ============
    const empOff = await api("POST", "/api/offboarding", {
      access: emp.access,
      body: { employee: emp8._id },
    });
    ok("67. employee cannot initiate offboarding → 403", empOff.status === 403);
    const emp6 = (
      await api("GET", "/api/employees/CY0626AD111", { access: hr.access })
    ).data.employee;
    const off = await api("POST", "/api/offboarding", {
      access: hr.access,
      body: { employee: emp6._id, reason: "Resignation" },
    });
    ok("68. HR initiates offboarding → 201", off.status === 201);
    const offComplete = await api(
      "PUT",
      "/api/offboarding/" + off.data.offboarding._id,
      { access: hr.access, body: { status: "Completed" } },
    );
    ok("69. completing offboarding succeeds", offComplete.status === 200);
    const emp6After = (
      await api("GET", "/api/employees/CY0626AD111", { access: hr.access })
    ).data.employee;
    ok(
      "70. offboarded employee marked Exited (record kept, not deleted)",
      emp6After.status === "Exited",
    );
    const org = await api("GET", "/api/org-chart", { access: emp.access });
    ok(
      "71. org chart returns a scoped reporting tree",
      org.status === 200 &&
        Array.isArray(org.data.roots) &&
        org.data.scope === "self" &&
        org.data.count >= 1,
    );
    const ana = await api("GET", "/api/analytics/overview", {
      access: hr.access,
    });
    ok(
      "72. HR analytics overview → real metrics (company-wide)",
      ana.status === 200 &&
        typeof ana.data.headcount === "number" &&
        Array.isArray(ana.data.leaveByStatus) &&
        ana.data.scope === "company",
    );
    const empAna = await api("GET", "/api/analytics/overview", {
      access: emp.access,
    });
    ok("73. employee cannot read analytics → 403", empAna.status === 403);
    // M1: manager analytics must exclude non-team payroll / leave (confidential aggregates)
    const mgrAna = await api("GET", "/api/analytics/overview", {
      access: mgr.access,
    });
    const hrPayNet = (ana.data.payrollByStatus || []).reduce(
      (s, p) => s + (p.net || 0),
      0,
    );
    const mgrPayNet = (mgrAna.data.payrollByStatus || []).reduce(
      (s, p) => s + (p.net || 0),
      0,
    );
    const hrLeaveTotal = (ana.data.leaveByStatus || []).reduce(
      (s, l) => s + (l.count || 0),
      0,
    );
    const mgrLeaveTotal = (mgrAna.data.leaveByStatus || []).reduce(
      (s, l) => s + (l.count || 0),
      0,
    );
    ok(
      "72a. manager analytics scope = team",
      mgrAna.status === 200 && mgrAna.data.scope === "team",
    );
    ok(
      "72b. manager analytics excludes non-team payroll (net < company)",
      mgrPayNet < hrPayNet,
    );
    ok(
      "72c. manager analytics excludes non-team leave (count < company)",
      mgrLeaveTotal < hrLeaveTotal,
    );
    ok(
      "72d. manager analytics headcount is team-only (< company)",
      mgrAna.data.headcount < ana.data.headcount,
    );
    // HR/Admin/Super remain company-wide — ADMIN must match HR's company figures, not team-scoped
    const adminAna = await api("GET", "/api/analytics/overview", {
      access: admin.access,
    });
    ok(
      "72e. ADMIN analytics remains company-wide",
      adminAna.status === 200 &&
        adminAna.data.scope === "company" &&
        adminAna.data.headcount === ana.data.headcount,
    );

    // ============ SECURITY MATRIX (§28) — explicit cross-role / cross-team denials ============
    const mNonTeam = await api("GET", "/api/employees/CY0525RS109", {
      access: mgr.access,
    });
    ok("74. manager → non-team employee record → 403", mNonTeam.status === 403);
    const mTeam = await api("GET", "/api/employees/CY0226AR110", {
      access: mgr.access,
    });
    ok("75. manager → own-team employee record → 200", mTeam.status === 200);
    const mDel = await api("DELETE", "/api/employees/CY0226AR110", {
      access: mgr.access,
    });
    ok("76. manager → delete employee → 403", mDel.status === 403);
    const mPayW = await api("POST", "/api/payroll", {
      access: mgr.access,
      body: { employee: emp8._id, period: "2099-01", gross: 1 },
    });
    ok("77. manager → create payroll (HR-only) → 403", mPayW.status === 403);
    const mUsers = await api("GET", "/api/users", { access: mgr.access });
    ok("78. manager → user administration → 403", mUsers.status === 403);
    const anyLeave = (await api("GET", "/api/leaves", { access: hr.access }))
      .data.leaves[0];
    const eApprove = await api("PUT", "/api/leaves/" + anyLeave._id, {
      access: emp.access,
      body: { status: "Approved" },
    });
    ok("79. employee → approve leave → 403", eApprove.status === 403);
    const ePayW = await api("POST", "/api/payroll", {
      access: emp.access,
      body: { employee: emp8._id, period: "2099-02", gross: 1 },
    });
    ok("80. employee → create payroll → 403", ePayW.status === 403);
    const eAll = await api("GET", "/api/employees", { access: emp.access });
    ok(
      "81. employee → employees list is self-only (data isolation)",
      eAll.status === 200 && eAll.data.count === 1,
    );

    // ============ USER-ROLE SECURITY (§29) — ADMIN→SUPER_ADMIN escalation & role invariants ============
    const superA = await login("superadmin@cyethack.com", "Super@123");
    const superId = superA.user.id,
      adminId = admin.user.id,
      empUserId = emp.user.id;

    // (1,2) ADMIN cannot assign SUPER_ADMIN — to self or to another user
    const aSelfSuper = await api("PUT", "/api/users/" + adminId, {
      access: admin.access,
      body: { role: "SUPER_ADMIN" },
    });
    ok(
      "82. ADMIN cannot self-promote to SUPER_ADMIN → 403",
      aSelfSuper.status === 403,
    );
    const aOtherSuper = await api("PUT", "/api/users/" + empUserId, {
      access: admin.access,
      body: { role: "SUPER_ADMIN" },
    });
    ok(
      "83. ADMIN cannot promote another user to SUPER_ADMIN → 403",
      aOtherSuper.status === 403,
    );

    // (3) HR cannot assign SUPER_ADMIN
    const hrSuper = await api("PUT", "/api/users/" + empUserId, {
      access: hr.access,
      body: { role: "SUPER_ADMIN" },
    });
    ok("84. HR cannot assign SUPER_ADMIN → 403", hrSuper.status === 403);

    // (4,5) MANAGER / EMPLOYEE cannot assign SUPER_ADMIN (blocked at the route)
    const mgrSuper = await api("PUT", "/api/users/" + empUserId, {
      access: mgr.access,
      body: { role: "SUPER_ADMIN" },
    });
    ok("85. MANAGER cannot assign SUPER_ADMIN → 403", mgrSuper.status === 403);
    const empSuper = await api("PUT", "/api/users/" + empUserId, {
      access: emp.access,
      body: { role: "SUPER_ADMIN" },
    });
    ok("86. EMPLOYEE cannot assign SUPER_ADMIN → 403", empSuper.status === 403);

    // (6) No one may change their OWN role
    const aSelfHr = await api("PUT", "/api/users/" + adminId, {
      access: admin.access,
      body: { role: "HR" },
    });
    ok(
      "87. a user cannot change their own role (ADMIN self→HR) → 403",
      aSelfHr.status === 403,
    );
    const sSelfAdmin = await api("PUT", "/api/users/" + superId, {
      access: superA.access,
      body: { role: "ADMIN" },
    });
    ok(
      "88. SUPER_ADMIN cannot change their own role → 403",
      sSelfAdmin.status === 403,
    );

    // (7) ADMIN cannot demote or deactivate a SUPER_ADMIN
    const aDemoteSuper = await api("PUT", "/api/users/" + superId, {
      access: admin.access,
      body: { role: "EMPLOYEE" },
    });
    ok(
      "89. ADMIN cannot demote a SUPER_ADMIN → 403",
      aDemoteSuper.status === 403,
    );
    const aDeactSuper = await api("PUT", "/api/users/" + superId, {
      access: admin.access,
      body: { status: "inactive" },
    });
    ok(
      "90. ADMIN cannot deactivate a SUPER_ADMIN → 403",
      aDeactSuper.status === 403,
    );

    // (8) HR cannot demote or deactivate a SUPER_ADMIN
    const hrDemoteSuper = await api("PUT", "/api/users/" + superId, {
      access: hr.access,
      body: { role: "EMPLOYEE" },
    });
    ok(
      "91. HR cannot demote a SUPER_ADMIN → 403",
      hrDemoteSuper.status === 403,
    );
    const hrDeactSuper = await api("PUT", "/api/users/" + superId, {
      access: hr.access,
      body: { status: "suspended" },
    });
    ok(
      "92. HR cannot deactivate a SUPER_ADMIN → 403",
      hrDeactSuper.status === 403,
    );

    // (9) MANAGER cannot modify roles at all (blocked at the route)
    const mgrRole = await api("PUT", "/api/users/" + empUserId, {
      access: mgr.access,
      body: { role: "HR" },
    });
    ok("93. MANAGER cannot modify roles → 403", mgrRole.status === 403);

    // (10) The last active SUPER_ADMIN cannot be demoted/deactivated (409 invariant);
    //      but a NON-last Super Admin can be. Order matters: only the seeded super is active here.
    const sDeactLast = await api("PUT", "/api/users/" + superId, {
      access: superA.access,
      body: { status: "inactive" },
    });
    ok(
      "94. cannot deactivate the LAST active SUPER_ADMIN → 409",
      sDeactLast.status === 409,
    );
    const mkSuper2 = await api("POST", "/api/users", {
      access: superA.access,
      body: {
        fullName: "Backup Super",
        email: "super2@cyethack.com",
        password: "Super2@123",
        role: "SUPER_ADMIN",
      },
    });
    ok(
      "95. SUPER_ADMIN can create another SUPER_ADMIN → 201",
      mkSuper2.status === 201,
    );
    const super2Id = mkSuper2.data.user && mkSuper2.data.user.id;
    const deactSuper2 = await api("PUT", "/api/users/" + super2Id, {
      access: superA.access,
      body: { status: "inactive" },
    });
    ok(
      "96. a non-last SUPER_ADMIN can be deactivated → 200",
      deactSuper2.status === 200,
    );

    // Sanity: the escalation attempts changed nothing — ADMIN is still ADMIN
    const adminStill = await api("GET", "/api/auth/me", {
      access: admin.access,
    });
    ok(
      "97. ADMIN role unchanged after blocked escalations",
      adminStill.status === 200 && adminStill.data.user.role === "ADMIN",
    );

    // (6-status) full status-code matrix for role management: 401 unauth, 400 invalid role
    const noAuthUpd = await api("PUT", "/api/users/" + empUserId, {
      body: { role: "MANAGER" },
    });
    ok(
      "98. unauthenticated role-management request → 401",
      noAuthUpd.status === 401,
    );
    const badRole = await api("PUT", "/api/users/" + empUserId, {
      access: superA.access,
      body: { role: "NOPE" },
    });
    ok(
      "99. invalid role value in role-management → 400",
      badRole.status === 400,
    );

    // ============ M2: employee delete is a SOFT-DELETE that disables the login ============
    const exitUser = await api("POST", "/api/users", {
      access: admin.access,
      body: {
        fullName: "Exit Test",
        email: "exit@cyethack.com",
        password: "ExitUser@123",
        role: "EMPLOYEE",
        employeeId: "CY0200",
      },
    });
    ok(
      "104. provision a throwaway employee user → 201",
      exitUser.status === 201,
    );
    const exitUserId = exitUser.data.user.id;
    const exitEmp = await api("POST", "/api/employees", {
      access: hr.access,
      body: {
        employeeId: "CY0200",
        fullName: "Exit Test",
        department: "Engineering",
        user: exitUserId,
        status: "Active",
      },
    });
    ok("105. linked employee record created → 201", exitEmp.status === 201);
    const exitEmpId = exitEmp.data.employee._id;
    const exitPay = await api("POST", "/api/payroll", {
      access: hr.access,
      body: {
        employee: exitEmpId,
        period: "2026-07",
        gross: 50000,
        status: "Paid",
      },
    });
    ok("106. dependent payroll record created → 201", exitPay.status === 201);
    const preLogin = await login("exit@cyethack.com", "ExitUser@123");
    ok(
      "107. throwaway user can log in BEFORE delete → 200",
      preLogin.status === 200,
    );
    const softDel = await api("DELETE", "/api/employees/CY0200", {
      access: hr.access,
    });
    ok(
      "108. delete employee → 200 (soft-delete)",
      softDel.status === 200 && softDel.data.loginDisabled === true,
    );
    const postLogin = await login("exit@cyethack.com", "ExitUser@123");
    ok(
      "109. deleted employee can no longer log in → 403",
      postLogin.status === 403,
    );
    const stillThere = await api("GET", "/api/employees/CY0200", {
      access: hr.access,
    });
    ok(
      "110. employee record preserved and marked Exited",
      stillThere.status === 200 && stillThere.data.employee.status === "Exited",
    );
    const payAfter = await api("GET", "/api/payroll?employee=" + exitEmpId, {
      access: hr.access,
    });
    ok(
      "111. dependent payroll record preserved (auditable)",
      payAfter.status === 200 && payAfter.data.count >= 1,
    );

    // M2 §5: the exited employee is gone from the ACTIVE roster, but preserved and
    // retrievable for historical / offboarding views.
    const activeRoster = await api("GET", "/api/employees?status=Active", {
      access: hr.access,
    });
    ok(
      "134. exited employee absent from the active listing",
      activeRoster.status === 200 &&
        !activeRoster.data.employees.some((e) => e.employeeId === "CY0200"),
    );
    const defaultRoster = await api("GET", "/api/employees", {
      access: hr.access,
    });
    ok(
      "135. default roster excludes exited staff",
      !defaultRoster.data.employees.some((e) => e.employeeId === "CY0200"),
    );
    const withExited = await api("GET", "/api/employees?includeExited=true", {
      access: hr.access,
    });
    ok(
      "136. exited employee retrievable with includeExited (record preserved)",
      withExited.data.employees.some(
        (e) => e.employeeId === "CY0200" && e.status === "Exited",
      ),
    );

    // M2 §2: the linked login is deactivated in the database (not just blocked in the response).
    const exitedUserDoc = await User.findById(exitUserId);
    ok(
      "137. linked user deactivated (status=inactive) after removal",
      !!exitedUserDoc && exitedUserDoc.status === "inactive",
    );

    // M2 §6: soft-deleting an ACTIVE employee removes them from the analytics/report
    // headcount (add → +1, remove → back to baseline). Historical data is untouched.
    const anaBase = (
      await api("GET", "/api/analytics/overview", { access: hr.access })
    ).data.headcount;
    const repBase = (
      await api("GET", "/api/reports/summary", { access: hr.access })
    ).data.metrics.headcount;
    await api("POST", "/api/employees", {
      access: hr.access,
      body: {
        employeeId: "CY0201",
        fullName: "Analytics Exit",
        department: "Engineering",
        status: "Active",
      },
    });
    const anaMid = (
      await api("GET", "/api/analytics/overview", { access: hr.access })
    ).data.headcount;
    ok(
      "138. adding an active employee raises the analytics headcount",
      anaMid === anaBase + 1,
    );
    const anaDel = await api("DELETE", "/api/employees/CY0201", {
      access: hr.access,
    });
    ok(
      "139. soft-delete succeeds and marks Exited (analytics fixture)",
      anaDel.status === 200 && anaDel.data.status === "Exited",
    );
    const anaAfter = (
      await api("GET", "/api/analytics/overview", { access: hr.access })
    ).data.headcount;
    const repAfter = (
      await api("GET", "/api/reports/summary", { access: hr.access })
    ).data.metrics.headcount;
    ok(
      "140. analytics headcount excludes the exited employee",
      anaAfter === anaBase,
    );
    ok(
      "141. reports headcount excludes the exited employee",
      repAfter === repBase,
    );

    // ============ LOW HARDENING — salary / attendance / leave / payroll validation ============
    // Salary projection: only HR/Admin/Super see compensation
    const hrEmpView = await api("GET", "/api/employees/CY0226AR110", {
      access: hr.access,
    });
    ok(
      "116. HR sees employee salary",
      hrEmpView.status === 200 &&
        typeof hrEmpView.data.employee.salary === "number",
    );
    const mgrEmpView = await api("GET", "/api/employees/CY0226AR110", {
      access: mgr.access,
    }); // CY0226AR110 is on the manager's team
    ok(
      "117. MANAGER does not see a team member salary",
      mgrEmpView.status === 200 &&
        mgrEmpView.data.employee.salary === undefined,
    );
    const empSelfView = await api("GET", "/api/employees/CY0525RS109", {
      access: emp.access,
    });
    ok(
      "118. EMPLOYEE does not see salary",
      empSelfView.status === 200 &&
        empSelfView.data.employee.salary === undefined,
    );
    const mgrListLow = await api("GET", "/api/employees", {
      access: mgr.access,
    });
    ok(
      "119. MANAGER employee list omits salary",
      mgrListLow.status === 200 &&
        mgrListLow.data.employees.every((e) => e.salary === undefined),
    );
    // ADMIN sees salary per the existing permission model (payroll:read via payroll:*)
    const adminEmpView = await api("GET", "/api/employees/CY0226AR110", {
      access: admin.access,
    });
    ok(
      "150. ADMIN sees employee salary (payroll:read)",
      adminEmpView.status === 200 &&
        typeof adminEmpView.data.employee.salary === "number",
    );
    // Strict: for unauthorised roles the salary PROPERTY is ABSENT (not null, not present-as-undefined)
    ok(
      "151. MANAGER read: salary property is absent (not null)",
      !Object.prototype.hasOwnProperty.call(mgrEmpView.data.employee, "salary"),
    );
    ok(
      "152. EMPLOYEE read: salary property is absent (not null)",
      !Object.prototype.hasOwnProperty.call(
        empSelfView.data.employee,
        "salary",
      ),
    );
    ok(
      "153. MANAGER list: no row carries a salary property",
      mgrListLow.data.employees.every(
        (e) => !Object.prototype.hasOwnProperty.call(e, "salary"),
      ),
    );
    // No OTHER employee fields were removed when salary is stripped
    const mgrEmp = mgrEmpView.data.employee;
    ok(
      "154. non-salary fields intact for MANAGER read",
      mgrEmp.employeeId === "CY0226AR110" &&
        !!mgrEmp.fullName &&
        !!mgrEmp.department &&
        !!mgrEmp.designation,
    );
    // HR list still carries salary (authorised)
    const hrListSal = await api("GET", "/api/employees", { access: hr.access });
    ok(
      "155. HR list includes salary (authorised)",
      hrListSal.status === 200 &&
        hrListSal.data.employees.some((e) => typeof e.salary === "number"),
    );

    // ============ LOW HARDENING — org chart role-scoped visibility ============
    const flattenNodes = (roots) => {
      const out = [];
      const walk = (n) => {
        out.push(n);
        (n.reports || []).forEach(walk);
      };
      (roots || []).forEach(walk);
      return out;
    };
    const orgIds = (resp) =>
      flattenNodes(resp.data.roots).map((n) => n.employeeId);
    const orgHR = await api("GET", "/api/org-chart", { access: hr.access });
    const orgAdmin = await api("GET", "/api/org-chart", {
      access: admin.access,
    });
    const orgSuper = await api("GET", "/api/org-chart", {
      access: superA.access,
    });
    const orgMgr = await api("GET", "/api/org-chart", { access: mgr.access });
    const orgEmp2 = await api("GET", "/api/org-chart", { access: emp.access });
    ok(
      "156. HR org chart is company-wide",
      orgHR.status === 200 &&
        orgHR.data.scope === "company" &&
        orgIds(orgHR).includes("CY0125JS201") &&
        orgIds(orgHR).includes("CY0125JS201"),
    );
    ok(
      "157. ADMIN org chart is company-wide (same size as HR)",
      orgAdmin.status === 200 &&
        orgAdmin.data.scope === "company" &&
        orgAdmin.data.count === orgHR.data.count,
    );
    ok(
      "158. SUPER_ADMIN org chart is company-wide (same size as HR)",
      orgSuper.status === 200 &&
        orgSuper.data.scope === "company" &&
        orgSuper.data.count === orgHR.data.count,
    );
    const mgrIds = orgIds(orgMgr);
    ok(
      "159. MANAGER org chart is team-scoped (own subtree)",
      orgMgr.status === 200 &&
        orgMgr.data.scope === "team" &&
        mgrIds.includes("CY0824SD301") &&
        mgrIds.includes("CY0226AR110"),
    );
    ok(
      "160. MANAGER org chart excludes unrelated departments",
      !mgrIds.includes("CY0125JS201") &&
        !mgrIds.includes("CY0525RS109") &&
        !mgrIds.includes("CY0125JS201"),
    );
    ok(
      "161. MANAGER is the root of their own team tree",
      orgMgr.data.roots.length === 1 &&
        orgMgr.data.roots[0].employeeId === "CY0824SD301" &&
        orgMgr.data.roots[0].manager === null,
    );
    const empIds = orgIds(orgEmp2);
    ok(
      "162. EMPLOYEE org chart is self-scoped (own reporting line up to root)",
      orgEmp2.status === 200 &&
        orgEmp2.data.scope === "self" &&
        empIds.includes("CY0525RS109") &&
        empIds.includes("CY0125JS201") &&
        empIds.includes("CY0125JS201"),
    );
    ok(
      "163. EMPLOYEE org chart excludes unrelated staff and peers",
      !empIds.includes("CY0824SD301") &&
        !empIds.includes("CY0226AR110") &&
        !empIds.includes("CY0726SS112"),
    );
    const noSensitive = (resp) =>
      flattenNodes(resp.data.roots).every(
        (n) =>
          !("salary" in n) &&
          !("email" in n) &&
          !("phone" in n) &&
          !("dob" in n) &&
          !("address" in n),
      );
    ok(
      "164. org chart never exposes salary/contact fields (all roles)",
      [orgHR, orgMgr, orgEmp2].every(noSensitive),
    );

    const emp8b = (
      await api("GET", "/api/employees/CY0525RS109", { access: hr.access })
    ).data.employee;

    // Attendance status enum enforced on the upsert path
    const badAtt = await api("POST", "/api/attendance", {
      access: hr.access,
      body: { employee: emp8b._id, date: "2026-09-15", status: "TELEPORTED" },
    });
    ok("120. invalid attendance status → 400", badAtt.status === 400);

    // Leave: server computes days (client value ignored) and rejects a reversed range
    const inflated = await api("POST", "/api/leaves", {
      access: emp.access,
      body: {
        type: "Casual Leave",
        from: "2026-11-02",
        to: "2026-11-04",
        days: 999,
        reason: "x",
      },
    });
    ok(
      "121. server ignores client-supplied leave days (computes 3)",
      inflated.status === 201 && inflated.data.leave.days === 3,
    );
    const badRange = await api("POST", "/api/leaves", {
      access: emp.access,
      body: {
        type: "Casual Leave",
        from: "2026-11-10",
        to: "2026-11-05",
        reason: "x",
      },
    });
    ok("122. reversed leave date range → 400", badRange.status === 400);

    // Payroll: non-negative net + deductions deep-merge
    const negPay = await api("POST", "/api/payroll", {
      access: hr.access,
      body: {
        employee: emp8b._id,
        period: "2030-01",
        gross: 1000,
        deductions: { pf: 5000 },
      },
    });
    ok(
      "123. payroll where deductions exceed gross (negative net) → 400",
      negPay.status === 400,
    );
    const goodPay = await api("POST", "/api/payroll", {
      access: hr.access,
      body: {
        employee: emp8b._id,
        period: "2030-02",
        gross: 10000,
        deductions: { pf: 1000, tds: 500 },
      },
    });
    ok(
      "124. payroll net computed (10000 - 1500 = 8500)",
      goodPay.status === 201 && goodPay.data.payslip.net === 8500,
    );
    const mergePay = await api(
      "PUT",
      "/api/payroll/" + goodPay.data.payslip._id,
      { access: hr.access, body: { deductions: { tds: 800 } } },
    );
    ok(
      "125. deductions deep-merge preserves pf, recomputes net",
      mergePay.status === 200 &&
        mergePay.data.payslip.deductions.pf === 1000 &&
        mergePay.data.payslip.deductions.tds === 800 &&
        mergePay.data.payslip.net === 8200,
    );

    // ============ AUDIT LOG (§13) — sensitive actions recorded; HR-only to read ============
    const empAudit = await api("GET", "/api/audit", { access: emp.access });
    ok("126. employee cannot read audit log → 403", empAudit.status === 403);
    const mgrAudit = await api("GET", "/api/audit", { access: mgr.access });
    ok("127. manager cannot read audit log → 403", mgrAudit.status === 403);
    const hrAudit = await api("GET", "/api/audit", { access: hr.access });
    ok(
      "128. HR can read audit log → 200 with entries",
      hrAudit.status === 200 && hrAudit.data.count > 0,
    );
    const createLogs = await api("GET", "/api/audit?action=employee.create", {
      access: hr.access,
    });
    ok(
      "129. employee.create was logged with target",
      createLogs.status === 200 &&
        createLogs.data.logs.some((l) => l.targetId === "CY0100"),
    );
    ok(
      "130. audit entries capture actor identity + role",
      hrAudit.data.logs.every((l) => !!l.actorRole && !!l.action),
    );
    // a fresh sensitive action appears in the trail
    const assign = await api("PUT", "/api/employees/CY0525RS109", {
      access: hr.access,
      body: { manager: "CY0824SD301" },
    });
    await new Promise((r) => setTimeout(r, 250)); // allow the fire-and-forget audit write to flush
    const assignLogs = await api(
      "GET",
      "/api/audit?action=employee.assign_manager",
      { access: hr.access },
    );
    ok(
      "131. assign-manager action is logged with target",
      assign.status === 200 &&
        assignLogs.data.logs.some((l) => l.targetId === "CY0525RS109"),
    );

    // ============ SECURITY: stored password is hashed ============
    const dbUser = await User.findOne({
      email: "jaya.sahu@cyethack.com",
    }).select("+passwordHash");
    ok(
      "40. stored password is bcrypt-hashed (not plaintext)",
      /^\$2[aby]\$/.test(dbUser.passwordHash) &&
        !dbUser.passwordHash.includes("Hr@123"),
    );

    // admin broad access — default roster is the ACTIVE workforce (exited excluded);
    // the full historical set is still retrievable with ?includeExited=true (M2 §5).
    const adminAll = await api("GET", "/api/employees", {
      access: admin.access,
    });
    ok(
      "22. admin sees the active roster (exited excluded)",
      adminAll.status === 200 &&
        adminAll.data.count >= 5 &&
        adminAll.data.employees.every((e) => e.status !== "Exited"),
    );
    const adminAllInc = await api("GET", "/api/employees?includeExited=true", {
      access: admin.access,
    });
    ok(
      "22b. admin can include exited employees for historical views",
      adminAllInc.status === 200 &&
        adminAllInc.data.count > adminAll.data.count &&
        adminAllInc.data.employees.some((e) => e.status === "Exited"),
    );

    // ============ M4: bootstrap-admin requires SETUP_TOKEN (LAST — this wipes users) ============
    const TOKEN = process.env.SETUP_TOKEN;
    const bootBusy = await api("POST", "/api/auth/bootstrap-admin", {
      body: {
        fullName: "Root",
        email: "root@cyethack.com",
        password: "Root@1234",
        setupToken: TOKEN,
      },
    });
    ok(
      "112. bootstrap refused while users still exist → 403",
      bootBusy.status === 403,
    );
    await User.deleteMany({}); // fresh DB to exercise the token gate
    const bootNoTok = await api("POST", "/api/auth/bootstrap-admin", {
      body: {
        fullName: "Root",
        email: "root@cyethack.com",
        password: "Root@1234",
      },
    });
    ok(
      "113. bootstrap without SETUP_TOKEN (empty DB) → 403",
      bootNoTok.status === 403,
    );
    const bootBadTok = await api("POST", "/api/auth/bootstrap-admin", {
      body: {
        fullName: "Root",
        email: "root@cyethack.com",
        password: "Root@1234",
        setupToken: "wrong-token",
      },
    });
    ok(
      "114. bootstrap with wrong SETUP_TOKEN → 403",
      bootBadTok.status === 403,
    );
    const bootOk = await api("POST", "/api/auth/bootstrap-admin", {
      body: {
        fullName: "Root",
        email: "root@cyethack.com",
        password: "Root@1234",
        setupToken: TOKEN,
      },
    });
    ok(
      "115. bootstrap with correct SETUP_TOKEN + empty DB → 201",
      bootOk.status === 201,
    );
    // security: the setup token is NEVER echoed back in the response body.
    ok(
      "142. bootstrap response does not leak the setup token",
      JSON.stringify(bootOk.data || {}).indexOf(TOKEN) === -1,
    );
    // normal login remains unaffected — the freshly bootstrapped admin can sign in.
    const bootLogin = await login("root@cyethack.com", "Root@1234");
    ok(
      "143. bootstrapped admin can log in normally → 200 + access token",
      bootLogin.status === 200 && !!bootLogin.access,
    );

    // rule 4 (broad): the DB now holds a SINGLE ADMIN and NO Super Admin. That last
    // active administrative account must not be removable — the system must always keep
    // at least one active administrator.
    const rootLogin = await login("root@cyethack.com", "Root@1234");
    const rootDeact = await api("PUT", "/api/users/" + rootLogin.user.id, {
      access: rootLogin.access,
      body: { status: "inactive" },
    });
    ok(
      "132. cannot deactivate the last active administrator (ADMIN, no super) → blocked",
      [400, 403, 409].includes(rootDeact.status),
    );
    const rootDemote = await api("PUT", "/api/users/" + rootLogin.user.id, {
      access: rootLogin.access,
      body: { role: "EMPLOYEE" },
    });
    ok(
      "133. last administrator cannot self-demote its role → 403",
      rootDemote.status === 403,
    );
  } catch (e) {
    console.error("TEST HARNESS ERROR:", e);
    fail++;
    fails.push("harness: " + e.message);
  } finally {
    server.close();
    await disconnectDB();
    await mem.stop();
  }

  console.log(
    "\n======== RESULT: " + pass + " passed, " + fail + " failed ========",
  );
  if (fails.length) {
    console.log("Failed:");
    fails.forEach((f) => console.log("  - " + f));
  }
  process.exit(fail ? 1 : 0);
})();
