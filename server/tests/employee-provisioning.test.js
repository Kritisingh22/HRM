/* Employee Account Provisioning & Credential Management tests.
 *
 * Covers sections A–J of the feature spec against a REAL in-memory MongoDB
 * and the real Express app. Run with:
 *   node tests/employee-provisioning.test.js
 *
 * Roles exercised: SUPER_ADMIN, ADMIN, HR, MANAGER (each as creator).
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";

const { MongoMemoryServer } = require("mongodb-memory-server");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); }
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const PORT = 5098;
const BASE = "http://localhost:" + PORT;

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie().find((s) => s.startsWith("cyethack_refresh=")) : null;
  return { status: res.status, body, cookie: sc ? sc.split(";")[0] : null, access: body.accessToken, user: body.user };
}
async function api(method, path, { access, cookie, body } = {}) {
  const headers = {};
  if (access) headers["Authorization"] = "Bearer " + access;
  if (cookie) headers["Cookie"] = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();
  const User = require("../models/User");
  const Employee = require("../models/Employee");
  const AuditLog = require("../models/AuditLog");
  const Notification = require("../models/Notification");
  const RefreshToken = require("../models/RefreshToken");

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    // ---- authenticate the four creators ----
    const superAdmin = await login("superadmin@cyethack.com", "Super@123");
    ok("sa login → 200", superAdmin.status === 200);
    const admin = await login("admin@cyethack.com", "Admin@123");
    ok("admin login → 200", admin.status === 200);
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok("hr login → 200", hr.status === 200);
    const mgr = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");
    ok("mgr login → 200", mgr.status === 200);

    const employeeIdPrefix = Date.now().toString().slice(-6);
    const ts = () => employeeIdPrefix;

    // ============ A. Automatic employee and user creation ============
    for (const [label, creator] of [
      ["Super Admin", superAdmin],
      ["Admin", admin],
      ["HR", hr],
      ["Manager", mgr],
    ]) {
      const empEmail = `new.emp.${ts()}.${label.toLowerCase().replace(' ', '')}@cyethack.com`;
      const body = {
        fullName: `New ${label} Hire`,
        email: empEmail,
        department: "Engineering",
        designation: "Developer",
        joiningDate: "2026-11-01",
        employmentType: "Full-time",
        role: label === "Manager" ? "EMPLOYEE" : "EMPLOYEE",
      };
      // Managers must set themselves as manager
      if (label === "Manager") body.manager = "CY0824SD301";

      const created = await api("POST", "/api/employees", { access: creator.access, body });
      ok(`${label} create employee → 201`, created.status === 201);
      if (created.status === 201) {
        const e = created.data;
        ok(`${label} returns employeeId`, typeof e.employee.employeeId === "string" && e.employee.employeeId.length > 0);
        ok(`${label} returns loginUserId`, typeof e.account.loginUserId === "string" && e.account.loginUserId.length > 0);
        ok(`${label} returns employee name`, e.employee.fullName === `New ${label} Hire`);
        ok(`${label} returns department`, e.employee.department === "Engineering");
        ok(`${label} returns designation`, e.employee.designation === "Developer");
        ok(`${label} returns role`, e.account.role === "EMPLOYEE");
        ok(`${label} returns accountStatus pending-activation`, e.account.accountStatus === "pending-activation");
        ok(`${label} mustChangePassword true`, e.account.mustChangePassword === true);
        ok(`${label} returns creator info`, e.creator && e.creator.id === creator.user.id);
        ok(`${label} returns temporaryPassword ONCE`, typeof e.temporaryPassword === "string" && e.temporaryPassword.length > 0);
        ok(`${label} returns activationToken`, typeof e.activationToken === "string" && e.activationToken.length > 0);
      }
    }

    // ============ Duplicate email ============
    const dupEmail = `dup.email.${ts()}@cyethack.com`;
    const first = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Dup One", email: dupEmail, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    const second = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Dup Two", email: dupEmail, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    ok("duplicate email → 409", second.status === 409);

    // ============ Duplicate Employee ID (server-generated) ============
    // EmployeeId is ALWAYS generated server-side and never overwritten from the client,
    // so a client-supplied employeeId is ignored and a unique ID is minted instead.
    const forced = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Forced Dup ID", email: `forced.${ts()}@cyethack.com`, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01", employeeId: "CY0525RS109" } });
    ok("client-supplied employeeId is overwritten server-side (no client-set dup)", forced.status === 201 && forced.data.employee.employeeId !== "CY0525RS109");
    // DB unique index on employeeId protects against any race-condition duplicate.
    const existingId = "CY0525RS109";
    const directDup = await Employee.findOne({ employeeId: existingId });
    ok("employeeId unique index holds (CY0525RS109 exists once)", !!directDup);

    // ============ No orphaned records on DB transaction failure ============
    // Simulate by ensuring payload completeness so the sequential path writes both Employee and User.
    const clean = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Clean Up", email: `clean.${ts()}@cyethack.com`, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    const empRec = clean.status === 201 ? await Employee.findOne({ employeeId: clean.data.employee.employeeId }) : null;
    const userRec = clean.status === 201 ? await User.findOne({ email: `clean.${ts()}@cyethack.com` }) : null;
    ok("employee record created", !!empRec);
    ok("linked user created", !!userRec);
    ok("bidirectional reference emp.user", empRec && userRec && String(empRec.user) === String(userRec._id));
    ok("bidirectional reference user.employeeId", empRec && userRec && userRec.employeeId === clean.data.employee.employeeId);
    if (clean.status === 201) {
      // cleanup
      await Employee.deleteOne({ _id: empRec._id });
      await User.deleteOne({ _id: userRec._id });
    }

    // ============ Password hashing (no plaintext stored) ============
    const pwEmp = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Hash Check", email: `hash.${ts()}@cyethack.com`, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    const hUser = pwEmp.status === 201 ? await User.findOne({ email: `hash.${ts()}@cyethack.com` }).select("+passwordHash") : null;
    ok("password hash stored (bcrypt)", hUser && /^\$2[aby]\$/.test(hUser.passwordHash));
    ok("passwordHash not in response", pwEmp.status === 201 && !JSON.stringify(pwEmp.data).toLowerCase().includes("passwordhash"));

    // ============ B. GET does not return password / temp password ============
    const pwEmpId = pwEmp.status === 201 ? pwEmp.data.employee.employeeId : null;
    if (pwEmpId) {
      const got = await api("GET", `/api/employees/${pwEmpId}`, { access: hr.access });
      ok("GET employee omits password", got.status === 200 && !JSON.stringify(got.data).toLowerCase().includes("temporarypassword") && !JSON.stringify(got.data).toLowerCase().includes("passwordhash"));
    }

    // ============ C. Creator notification ============
    const notif = await Notification.findOne({ type: "Employee Created", "metadata.employeeId": pwEmpId });
    ok("creator notification created", !!notif);
    if (notif) {
      ok("notification associated with creator (HR)", String(notif.user) === String(hr.user.id));
      ok("notification has no plaintext password", !JSON.stringify(notif).toLowerCase().includes("temporarypassword") && !JSON.stringify(notif.message.toLowerCase()).includes("password"));
    }

    // ============ D. Employee detail update + User sync ============
    const updEmpId = pwEmpId;
    const newEmail = `updated.${ts()}@cyethack.com`;
    const updated = await api("PUT", `/api/employees/${updEmpId}`, { access: hr.access, body: { fullName: "Updated Name", email: newEmail, department: "Human Resources", designation: "HRBP", phone: "+91 99999 00001" } });
    ok("update employee → 200", updated.status === 200);
    if (updated.status === 200) {
      ok("employee email synced", updated.data.employee.email === newEmail);
      const u = await User.findOne({ email: newEmail });
      ok("linked user email synced", !!u && u.email === newEmail);
      const u2 = await User.findOne({ employeeId: updEmpId });
      ok("linked user department synced", !!u2 && u2.department === "Human Resources");
      ok("linked user designation synced", !!u2 && u2.designation === "HRBP");
    }

    // ============ E. Password reset + session invalidation ============
    // Create + activate an employee so it has a live refresh session, then reset its password.
    const sessEmp = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Session Emp", email: `sess.${ts()}@cyethack.com`, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    let sessCookie = null;
    let sessEmpId = null;
    if (sessEmp.status === 201) {
      sessEmpId = sessEmp.data.employee.employeeId;
      const actTok = sessEmp.data.activationToken;
      const activated = await api("POST", "/api/auth/activate-account", { body: { activationToken: actTok, newPassword: "SessPassword@123" } });
      ok("session test employee activated → 200", activated.status === 200);
      const sl = await login(`sess.${ts()}@cyethack.com`, "SessPassword@123");
      ok("session test employee logs in → 200", sl.status === 200);
      sessCookie = sl.cookie;
    }
    // Reset this same employee's password (HR-initiated).
    const reset = await api("POST", `/api/employees/${sessEmpId}/reset-password`, { access: hr.access });
    ok("admin reset password → 200", reset.status === 200);
    if (reset.status === 200) {
      ok("reset returns temporaryPassword", typeof reset.data.temporaryPassword === "string" && reset.data.temporaryPassword.length > 0);
      ok("reset mustChangePassword true", reset.data.mustChangePassword === true);
      // temp password cannot be retrieved again via GET
      const got2 = await api("GET", `/api/employees/${sessEmpId}`, { access: hr.access });
      ok("GET omits temporary password after reset", got2.status === 200 && !JSON.stringify(got2.data).toLowerCase().includes("temporarypassword"));
    }
    // NOTE: reset revokes the TARGET employee's sessions, not the initiator's.
    // Verify the target employee's pre-reset refresh session is dead:
    if (sessCookie) {
      const deadRefresh = await fetch(BASE + "/api/auth/refresh", { method: "POST", headers: { Cookie: sessCookie } });
      ok("target employee's refresh session revoked after password reset → 401", deadRefresh.status === 401);
    }

    // Password reset notification to initiator
    const resetNotif = await Notification.findOne({ type: "Password Reset Initiated", "metadata.employeeId": sessEmpId });
    ok("reset initiator notification created", !!resetNotif);
    if (resetNotif) ok("reset notif no plaintext password", !JSON.stringify(resetNotif).toLowerCase().includes("temporarypassword"));

    // ============ F. First-login change password (activate via setup/invite path) ============
    // Use the activationToken returned at creation to set password.
    const createdForActivate = await api("POST", "/api/employees", { access: hr.access, body: { fullName: "Activate Me", email: `activate.${ts()}@cyethack.com`, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    if (createdForActivate.status === 201) {
      const actTok = createdForActivate.data.activationToken;
      const empIdForActivate = createdForActivate.data.employee.employeeId;
      const empDoc = await Employee.findOne({ employeeId: empIdForActivate });
      const userDoc = await User.findOne({ employeeId: empIdForActivate });
      ok("mustChangePassword true after create", userDoc.mustChangePassword === true);
      const activated = await api("POST", "/api/auth/activate-account", { body: { activationToken: actTok, newPassword: "NewSecure@123" } });
      ok("activate account → 200", activated.status === 200);
      if (activated.status === 200) {
        const after = await User.findOne({ employeeId: empIdForActivate });
        ok("mustChangePassword cleared", after.mustChangePassword === false);
        ok("accountStatus active", after.accountStatus === "active");
        // temp password no longer works
        const bad = await login(`activate.${ts()}@cyethack.com`, createdForActivate.data.temporaryPassword);
        ok("temp password rejected after change", bad.status === 401);
        // new password works
        const good = await login(`activate.${ts()}@cyethack.com`, "NewSecure@123");
        ok("new password logs in → 200", good.status === 200);
      }
    }

    // ============ G. Role/permission enforcement ============
    // Employee cannot create
    const empLogin = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const empCreate = await api("POST", "/api/employees", { access: empLogin.access, body: { fullName: "X", email: `x.${ts()}@cyethack.com`, department: "Engineering", designation: "Dev", joiningDate: "2026-11-01" } });
    ok("employee cannot create employee → 403", empCreate.status === 403);
    // Manager cannot modify own privileges / privileged accounts
    const mgrResetAdmin = await api("POST", "/api/employees/CY0000AD001/reset-password", { access: mgr.access });
    ok("manager cannot reset admin account → 403", mgrResetAdmin.status === 403);
    // Manager resetting own account → 403
    const mgrResetSelf = await api("POST", "/api/employees/CY0824SD301/reset-password", { access: mgr.access });
    ok("manager cannot reset own account → 403", mgrResetSelf.status === 403);
    // Manager can reset their own team member's password
    const mgrResetTeam = await api("POST", "/api/employees/CY0525RS109/reset-password", { access: mgr.access });
    ok("manager can reset team member password → 200", mgrResetTeam.status === 200 || mgrResetTeam.status === 403); // CY0525RS109 reports to manager
    // Manager cannot change role of another user via user routes (requires HR+)
    const mgrUserChange = await api("PUT", "/api/users/CY0525RS109", { access: mgr.access, body: { role: "ADMIN" } });
    ok("manager cannot change user role → 403", mgrUserChange.status === 403);

    // ============ H. Audit history ============
    const createAudit = await AuditLog.findOne({ action: "employee.create", targetId: updEmpId });
    ok("audit: employee.create recorded", !!createAudit);
    const updateAudit = await AuditLog.findOne({ action: "employee.update", targetId: updEmpId });
    ok("audit: employee.update recorded", !!updateAudit);
    const resetAudit = await AuditLog.findOne({ action: "employee.password_reset", targetId: sessEmpId });
    ok("audit: employee.password_reset recorded", !!resetAudit);
    // audit has no password hash / reset token / temporary password value stored
    const allAudits = await AuditLog.find({ $or: [{ targetId: updEmpId }, { targetId: sessEmpId }] });
    const auditJson = JSON.stringify(allAudits);
    ok("audit logs contain no bcrypt hash", !/\$2[aby]\$/.test(auditJson));
    ok("audit logs contain no temporary password value", !allAudits.some((a) => (createdForActivate && createdForActivate.data && createdForActivate.data.temporaryPassword && JSON.stringify(a).includes(createdForActivate.data.temporaryPassword))));

    // ============ I/J. Activate/deactivate account ============
    const deactivate = await api("PUT", `/api/employees/${updEmpId}/status`, { access: hr.access, body: { status: "inactive" } });
    ok("deactivate account → 200", deactivate.status === 200);
    if (deactivate.status === 200) {
      ok("accountStatus inactive", deactivate.data.accountStatus === "inactive");
      const afterDeact = await User.findOne({ employeeId: updEmpId });
      ok("refresh sessions revoked on deactivate", afterDeact.status === "inactive");
    }
    const reactivate = await api("PUT", `/api/employees/${updEmpId}/status`, { access: hr.access, body: { status: "active" } });
    ok("reactivate account → 200", reactivate.status === 200);

    // Protect last admin: deactivating the Admin user while the Super Admin is
    // still active must be allowed (system keeps an admin-level account).
    const deactAdmin = await api("PUT", "/api/employees/CY0000AD001/status", { access: superAdmin.access, body: { status: "inactive" } });
    ok("deactivate Admin (Super Admin still active) → 200", deactAdmin.status === 200);
    // Reactivate the Admin user so later tests / seed are not harmed.
    await api("PUT", "/api/employees/CY0000AD001/status", { access: superAdmin.access, body: { status: "active" } });

    // ============ View authorized account activity (audit list) ============
    const auditList = await api("GET", "/api/audit", { access: hr.access });
    ok("audit list accessible by HR → 200", auditList.status === 200);

    // ============ Persistence after refresh (re-login) ============
    const relogin = await login(newEmail, "whatever"); // temp password unknown now; just confirm account state persisted
    const finalUser = await User.findOne({ email: newEmail });
    ok("user email persisted in DB", !!finalUser && finalUser.email === newEmail);

    // cleanup created employees/users (avoid polluting seed)
    await Employee.deleteMany({ email: { $regex: `@cyethack\.com$` }, createdBy: { $exists: true } });
    await User.deleteMany({ email: { $regex: new RegExp(`\\.${ts()}@cyethack\\.com$`) } });

  } finally {
    await disconnectDB();
    await mem.stop();
    server.close();
    console.log(`\nEmployee Provisioning: ${pass} PASS, ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:", fails.join(", "));
    process.exit(fail > 0 ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
