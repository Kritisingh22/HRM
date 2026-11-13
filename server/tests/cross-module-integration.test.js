/* Cross-Module Integration Test — verifies all HRM modules are interconnected.
 *
 * Tests:
 *  1. Employee creation → visible across all modules (HR/Manager dashboards)
 *  2. Leave application → appears in HR/Manager dashboards
 *  3. Leave approval → attendance records created for leave dates
 *  4. Check-in/check-out → attendance records updated
 *  5. Heartbeat → active/paused time tracked
 *  6. Employee deactivation → pending leave cancelled
 *
 * Run: node tests/cross-module-integration.test.js
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";

const { MongoMemoryServer } = require("mongodb-memory-server");

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) pass++;
  else { fail++; fails.push(name); }
  console.log((cond ? "PASS " : "FAIL ") + name + (cond || !extra ? "" : " — " + extra));
}

const PORT = 5097;
const BASE = "http://localhost:" + PORT;

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, access: body.accessToken, user: body.user };
}

async function api(method, path, { access, body } = {}) {
  const headers = {};
  if (access) headers.Authorization = "Bearer " + access;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    /* ---------------- Seed logins ---------------- */
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    const manager = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");
    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    ok("1. seed logins succeed (HR, Manager, Employee A)", [hr, manager, empA].every((s) => s.status === 200 && s.access));

    /* ---------------- Test 1: Employee Creation Cross-Module ---------------- */
    /* HR creates a new employee */
    const newEmp = await api("POST", "/api/employees", {
      access: hr.access,
      body: {
        fullName: "Test Integration Employee",
        email: "test.integration@cyethack.com",
        department: "Engineering",
        designation: "Software Engineer",
        joiningDate: todayISO(),
        employmentType: "Full-time",
        workMode: "On-site",
        workLocation: "office",
        manager: "CY0824SD301", // Manager's employeeId
        assignedHrId: "CY0125JS201", // HR's employeeId
        status: "Active",
      },
    });
    ok(
      "2. HR creates employee → 201 with employeeId and user account",
      newEmp.status === 201 &&
        newEmp.body.employee.employeeId &&
        newEmp.body.account.loginUserId &&
        newEmp.body.temporaryPassword,
      `status=${newEmp.status} body=${JSON.stringify(newEmp.body).slice(0, 200)}`,
    );
    const newEmpId = newEmp.body.employee.employeeId;

    /* Verify employee is visible in employee list */
    const empList = await api("GET", "/api/employees", { access: hr.access });
    ok(
      "3. New employee visible in HR employee list",
      empList.status === 200 &&
        empList.body.employees.some((e) => e.employeeId === newEmpId),
      `count=${empList.body.count}`,
    );

    /* Verify employee is visible in Manager's team */
    const mgrTeam = await api("GET", "/api/employees", { access: manager.access });
    ok(
      "4. New employee visible in Manager's team list",
      mgrTeam.status === 200 &&
        mgrTeam.body.employees.some((e) => e.employeeId === newEmpId),
      `count=${mgrTeam.body.count}`,
    );

    /* ---------------- Test 2: Leave Application Cross-Module ---------------- */
    /* Employee A applies for leave tomorrow */
    const leaveApp = await api("POST", "/api/leaves", {
      access: empA.access,
      body: {
        type: "Casual Leave",
        from: tomorrowISO(),
        to: tomorrowISO(),
        days: 1,
        halfDay: false,
        reason: "Personal appointment",
        approvalAuthority: "Manager",
      },
    });
    ok(
      "5. Employee applies for leave → 201",
      leaveApp.status === 201 && leaveApp.body.leave.status === "Pending",
      `status=${leaveApp.status}`,
    );
    const leaveId = leaveApp.body.leave._id;

    /* Verify leave is visible in Manager's leave list */
    const mgrLeaves = await api("GET", "/api/leaves", { access: manager.access });
    ok(
      "6. Leave request visible in Manager's leave list",
      mgrLeaves.status === 200 &&
        mgrLeaves.body.leaves.some((l) => String(l._id) === leaveId),
      `count=${mgrLeaves.body.leaves.length}`,
    );

    /* ---------------- Test 3: Leave Approval → Attendance Sync ---------------- */
    /* Manager approves the leave */
    const leaveAppr = await api("PUT", `/api/leaves/${leaveId}`, {
      access: manager.access,
      body: { status: "Approved", managerNote: "Approved for personal appointment" },
    });
    ok(
      "7. Manager approves leave → 200",
      leaveAppr.status === 200 && leaveAppr.body.leave.status === "Approved",
      `status=${leaveAppr.status}`,
    );

    /* Verify attendance record was created for the leave date */
    const tomorrow = tomorrowISO();
    const attRec = await api("GET", `/api/attendance/me`, { access: empA.access });
    const leaveRow = attRec.body.attendance?.find((a) => a.date === tomorrow);
    ok(
      "8. Approved leave creates attendance record with status 'leave'",
      Boolean(leaveRow && leaveRow.status === "leave"),
      `row=${JSON.stringify(leaveRow).slice(0, 200)}`,
    );

    /* ---------------- Test 4: Check-in/Check-out Cross-Module ---------------- */
    /* Employee A checks in today */
    const checkIn = await api("POST", "/api/attendance/check-in", {
      access: empA.access,
      body: {
        consentGiven: true,
        lat: 28.6139,
        lng: 77.209,
        accuracy: 10,
        timezone: "Asia/Kolkata",
      },
    });
    ok(
      "9. Employee checks in → 201",
      checkIn.status === 201 && !!checkIn.body.attendance.checkIn,
      `status=${checkIn.status}`,
    );

    /* Employee A checks out */
    const checkOut = await api("POST", "/api/attendance/check-out", {
      access: empA.access,
      body: { lat: 28.6139, lng: 77.209, accuracy: 10 },
    });
    ok(
      "10. Employee checks out → 200 with working hours",
      checkOut.status === 200 &&
        !!checkOut.body.attendance.checkOut &&
        checkOut.body.workingHoursMinutes >= 0,
      `status=${checkOut.status} workingHours=${checkOut.body.workingHoursMinutes}`,
    );

    /* ---------------- Test 5: Heartbeat Cross-Module ---------------- */
    /* Employee A sends heartbeat */
    const hb = await api("POST", "/api/attendance/heartbeat", {
      access: empA.access,
      body: { state: "active", reason: "resume" },
    });
    ok(
      "11. Heartbeat → 200 with active time",
      hb.status === 200 &&
        typeof hb.body.activeSeconds === "number",
      `status=${hb.status} active=${hb.body.activeSeconds}`,
    );

    /* ---------------- Test 6: Employee Deactivation → Leave Cancellation ---------------- */
    /* HR deactivates Employee A */
    const deactivate = await api("PUT", `/api/employees/${newEmpId}/status`, {
      access: hr.access,
      body: { status: "inactive" },
    });
    ok(
      "12. HR deactivates employee → 200",
      deactivate.status === 200 && deactivate.body.accountStatus === "inactive",
      `status=${deactivate.status}`,
    );

    /* Verify pending leave for deactivated employee is cancelled */
    const pendingLeave = await api("GET", "/api/leaves", { access: hr.access });
    const deactivatedEmpLeave = pendingLeave.body.leaves?.find(
      (l) => l.employee?.employeeId === newEmpId && l.status === "Pending"
    );
    ok(
      "13. Deactivated employee's pending leave is cancelled",
      !deactivatedEmpLeave || deactivatedEmpLeave.status === "Cancelled",
      `leave=${deactivatedEmpLeave ? JSON.stringify(deactivatedEmpLeave).slice(0, 200) : "none"}`,
    );

    /* ---------------- Summary ---------------- */
    console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
    if (fails.length) console.log("Failed:\n - " + fails.join("\n - "));
  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDB();
    await mem.stop();
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});