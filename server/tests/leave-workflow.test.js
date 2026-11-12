/* Leave workflow end-to-end tests against a real MongoDB (mongodb-memory-server)
 * and the real Express app. Covers all 20 scenarios from the leave workflow spec.
 *
 * Run with:  node tests/leave-workflow.test.js
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";
process.env.LEAVE_ENTITLEMENT_JSON = JSON.stringify({
  "Casual Leave": 12,
  "Sick Leave": 12,
  "Earned Leave": 15,
});

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

const PORT = 5098;
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

  const User = require("../models/User");
  const Leave = require("../models/Leave");
  const Notification = require("../models/Notification");
  const Employee = require("../models/Employee");

  // Helper: get the Employee _id for a session user
  async function empIdOf(access) {
    const me = await api("GET", "/api/auth/me", { access });
    return me.data.user.employeeId;
  }
  async function employeeObjectId(employeeId) {
    const emp = await Employee.findOne({ employeeId });
    return emp._id;
  }

  // Log in as the five roles
  const emp = await login("rohith.sai@cyethack.com", "GangCY0525RS109"); // CY0525RS109, reports to CY0824SD301
  ok("L1. Employee login → 200", emp.status === 200);

  // Give HR a manager so HR-initiated leave with approvalAuthority "Manager"
  // can be routed to the Manager for notification/approval.
  const hrEmp = await Employee.findOne({ employeeId: "CY0125JS201" });
  if (hrEmp) hrEmp.manager = "CY0824SD301";
  await hrEmp?.save();

  const mgr = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301"); // CY0824SD301, Manager
  ok("L2. Manager login → 200", mgr.status === 200);

  const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201"); // CY0125JS201, HR
  ok("L3. HR login → 200", hr.status === 200);

  const admin = await login("admin@cyethack.com", "Admin@123"); // CY0000AD001, Admin
  ok("L4. Admin login → 200", admin.status === 200);

  const superAdmin = await login("superadmin@cyethack.com", "Super@123"); // CY0000SA001, Super Admin
  ok("L5. Super Admin login → 200", superAdmin.status === 200);

  // ========================================================================
  // SCENARIO 1: Employee applies for leave
  // ========================================================================
  const tomorrow = new Date(Date.now() + 86400000)
    .toISOString()
    .slice(0, 10);
  const dayAfter = new Date(Date.now() + 172800000)
    .toISOString()
    .slice(0, 10);
  const day3 = new Date(Date.now() + 259200000)
    .toISOString()
    .slice(0, 10);
  const day4 = new Date(Date.now() + 345600000)
    .toISOString()
    .slice(0, 10);
  const day5 = new Date(Date.now() + 432000000)
    .toISOString()
    .slice(0, 10);
  const day6 = new Date(Date.now() + 518400000)
    .toISOString()
    .slice(0, 10);

  const applied = await api("POST", "/api/leaves", {
    access: emp.access,
    body: {
      type: "Casual Leave",
      from: tomorrow,
      to: dayAfter,
      days: 2,
      reason: "Personal work",
      approvalAuthority: "Manager",
    },
  });
  ok(
    "S1. Employee applies for leave → 201",
    applied.status === 201 && applied.data.leave.status === "Pending",
  );
  const leaveId = applied.data.leave._id;

  // ========================================================================
  // SCENARIO 2: HR receives the notification
  // ========================================================================
  // Since approvalAuthority is "Manager", the manager (not HR) gets notified.
  // Test HR notification by applying with approvalAuthority "HR".
  const appliedHR = await api("POST", "/api/leaves", {
    access: emp.access,
    body: {
      type: "Sick Leave",
      from: day3,
      to: day3,
      days: 1,
      reason: "Fever",
      approvalAuthority: "HR",
    },
  });
  ok(
    "S1b. Employee applies for HR-approved leave → 201",
    appliedHR.status === 201,
  );
  const hrLeaveId = appliedHR.data.leave._id;

  const hrNotifs = await api("GET", "/api/notifications?limit=50", {
    access: hr.access,
  });
  ok(
    "S2. HR receives leave request notification → 200",
    hrNotifs.status === 200 &&
      hrNotifs.data.notifications.some(
        (n) =>
          n.type === "Leave Request" &&
          n.metadata &&
          n.metadata.leaveId === hrLeaveId,
      ),
  );

  // ========================================================================
  // SCENARIO 3: HR approves the employee leave
  // ========================================================================
  const approved = await api("PUT", `/api/leaves/${hrLeaveId}`, {
    access: hr.access,
    body: { status: "Approved", managerNote: "Approved for recovery" },
  });
  ok(
    "S3. HR approves employee leave → 200",
    approved.status === 200 && approved.data.leave.status === "Approved",
  );

  // ========================================================================
  // SCENARIO 4: Employee sees Approved in My Leave Requests
  // ========================================================================
  const myLeaves = await api("GET", "/api/leaves", { access: emp.access });
  ok(
    "S4. Employee sees own leave → 200",
    myLeaves.status === 200 &&
      myLeaves.data.leaves.some(
        (l) => String(l._id) === String(hrLeaveId) && l.status === "Approved",
      ),
  );

  // ========================================================================
  // SCENARIO 5: Employee receives approval notification
  // ========================================================================
  const empNotifs = await api("GET", "/api/notifications?limit=50", {
    access: emp.access,
  });
  ok(
    "S5. Employee receives approval notification → 200",
    empNotifs.status === 200 &&
      empNotifs.data.notifications.some(
        (n) =>
          n.type === "Leave Decision" &&
          n.metadata &&
          n.metadata.leaveId === hrLeaveId &&
          n.metadata.action === "Approved",
      ),
  );

  // ========================================================================
  // SCENARIO 6: Leave balance is deducted exactly once
  // ========================================================================
  const balanceBefore = await api("GET", "/api/leaves/balance", {
    access: emp.access,
  });
  const sickBefore = balanceBefore.data.balances.find(
    (b) => b.type === "Sick Leave",
  );
  ok(
    "S6a. Balance endpoint returns sick leave",
    sickBefore && sickBefore.used >= 1,
  );

  // Re-approving should fail (already decided)
  const reApprove = await api("PUT", `/api/leaves/${hrLeaveId}`, {
    access: hr.access,
    body: { status: "Approved", managerNote: "Double approve" },
  });
  ok(
    "S6b. Re-approving already-approved leave → 400",
    reApprove.status === 400,
  );

  const balanceAfter = await api("GET", "/api/leaves/balance", {
    access: emp.access,
  });
  const sickAfter = balanceAfter.data.balances.find((b) => b.type === "Sick Leave");
  ok(
    "S6c. Balance deducted exactly once (used unchanged after re-approve attempt)",
    sickAfter.used === sickBefore.used,
  );

  // ========================================================================
  // SCENARIO 7: Manager approves an assigned employee's request
  // ========================================================================
  const mgrApproved = await api("PUT", `/api/leaves/${leaveId}`, {
    access: mgr.access,
    body: { status: "Approved", managerNote: "Approved" },
  });
  ok(
    "S7. Manager approves team member's leave → 200",
    mgrApproved.status === 200 && mgrApproved.data.leave.status === "Approved",
  );

  // ========================================================================
  // SCENARIO 8: HR applies for leave
  // ========================================================================
  const hrApplied = await api("POST", "/api/leaves", {
    access: hr.access,
    body: {
      type: "Casual Leave",
      from: day3,
      to: day3,
      days: 1,
      reason: "HR personal work",
      approvalAuthority: "Manager",
    },
  });
  ok(
    "S8. HR applies for leave → 201",
    hrApplied.status === 201,
  );
  const hrOwnLeaveId = hrApplied.data.leave._id;

  // ========================================================================
  // SCENARIO 9: Manager receives HR leave notification
  // ========================================================================
  const mgrNotifs = await api("GET", "/api/notifications?limit=50", {
    access: mgr.access,
  });
  ok(
    "S9. Manager receives HR leave notification → 200",
    mgrNotifs.status === 200 &&
      mgrNotifs.data.notifications.some(
        (n) =>
          n.type === "Leave Request" &&
          n.metadata &&
          n.metadata.leaveId === hrOwnLeaveId,
      ),
  );

  // ========================================================================
  // SCENARIO 10: Manager approves HR leave
  // ========================================================================
  const mgrApprovesHR = await api("PUT", `/api/leaves/${hrOwnLeaveId}`, {
    access: mgr.access,
    body: { status: "Approved", managerNote: "Approved HR leave" },
  });
  ok(
    "S10. Manager approves HR's leave → 200",
    mgrApprovesHR.status === 200 &&
      mgrApprovesHR.data.leave.status === "Approved",
  );

  // ========================================================================
  // SCENARIO 11: HR sees Approved in My Leave Requests
  // ========================================================================
  const hrLeaves = await api("GET", "/api/leaves", { access: hr.access });
  ok(
    "S11. HR sees own approved leave → 200",
    hrLeaves.status === 200 &&
      hrLeaves.data.leaves.some(
        (l) => String(l._id) === String(hrOwnLeaveId) && l.status === "Approved",
      ),
  );

  // ========================================================================
  // SCENARIO 12: HR receives approval notification
  // ========================================================================
  const hrNotifs2 = await api("GET", "/api/notifications?limit=50", {
    access: hr.access,
  });
  ok(
    "S12. HR receives approval notification → 200",
    hrNotifs2.status === 200 &&
      hrNotifs2.data.notifications.some(
        (n) =>
          n.type === "Leave Decision" &&
          n.metadata &&
          n.metadata.leaveId === hrOwnLeaveId &&
          n.metadata.action === "Approved",
      ),
  );

  // ========================================================================
  // SCENARIO 13: Manager cannot approve their own request
  // ========================================================================
  const mgrApplied = await api("POST", "/api/leaves", {
    access: mgr.access,
    body: {
      type: "Casual Leave",
      from: tomorrow,
      to: tomorrow,
      days: 1,
      reason: "Manager personal work",
      approvalAuthority: "HR",
    },
  });
  ok(
    "S13a. Manager applies for leave → 201",
    mgrApplied.status === 201,
  );
  const mgrOwnLeaveId = mgrApplied.data.leave._id;

  const selfApprove = await api("PUT", `/api/leaves/${mgrOwnLeaveId}`, {
    access: mgr.access,
    body: { status: "Approved", managerNote: "Self approve" },
  });
  ok(
    "S13b. Manager cannot approve own request → 403",
    selfApprove.status === 403,
  );

  // HR can approve the manager's request
  const hrApprovesMgr = await api("PUT", `/api/leaves/${mgrOwnLeaveId}`, {
    access: hr.access,
    body: { status: "Approved", managerNote: "HR approves manager" },
  });
  ok(
    "S13c. HR approves manager's leave → 200",
    hrApprovesMgr.status === 200,
  );

  // ========================================================================
  // SCENARIO 14: Rejected leave preserves leave balance
  // ========================================================================
  const rejApplied = await api("POST", "/api/leaves", {
    access: emp.access,
    body: {
      type: "Casual Leave",
      from: day4,
      to: day4,
      days: 1,
      reason: "Will be rejected",
      approvalAuthority: "Manager",
    },
  });
  ok(
    "S14a. Employee applies leave to be rejected → 201",
    rejApplied.status === 201,
  );
  const rejLeaveId = rejApplied.data.leave._id;

  const balBeforeRej = await api("GET", "/api/leaves/balance", {
    access: emp.access,
  });
  const casualBefore = balBeforeRej.data.balances.find(
    (b) => b.type === "Casual Leave",
  );

  const rejected = await api("PUT", `/api/leaves/${rejLeaveId}`, {
    access: mgr.access,
    body: { status: "Rejected", managerNote: "Release week" },
  });
  ok(
    "S14b. Manager rejects leave → 200",
    rejected.status === 200 && rejected.data.leave.status === "Rejected",
  );

  const balAfterRej = await api("GET", "/api/leaves/balance", {
    access: emp.access,
  });
  const casualAfter = balAfterRej.data.balances.find(
    (b) => b.type === "Casual Leave",
  );
  ok(
    "S14c. Rejected leave does not deduct balance",
    casualAfter.used === casualBefore.used,
  );

  // ========================================================================
  // SCENARIO 15: Pending leave can be cancelled
  // ========================================================================
  const cancelApplied = await api("POST", "/api/leaves", {
    access: emp.access,
    body: {
      type: "Casual Leave",
      from: day5,
      to: day5,
      days: 1,
      reason: "Will cancel",
      approvalAuthority: "Manager",
    },
  });
  ok(
    "S15a. Employee applies leave to cancel → 201",
    cancelApplied.status === 201,
  );
  const cancelLeaveId = cancelApplied.data.leave._id;

  const cancelled = await api("PUT", `/api/leaves/${cancelLeaveId}`, {
    access: emp.access,
    body: { status: "Cancelled" },
  });
  ok(
    "S15b. Employee cancels own pending leave → 200",
    cancelled.status === 200 && cancelled.data.leave.status === "Cancelled",
  );

  // ========================================================================
  // SCENARIO 16: Approved leave cancellation restores balance
  // ========================================================================
  const appForCancel = await api("POST", "/api/leaves", {
    access: emp.access,
    body: {
      type: "Earned Leave",
      from: day6,
      to: day6,
      days: 1,
      reason: "Approve then cancel",
      approvalAuthority: "Manager",
    },
  });
  ok(
    "S16a. Employee applies earned leave → 201",
    appForCancel.status === 201,
  );
  const appCancelId = appForCancel.data.leave._id;

  const approvedForCancel = await api("PUT", `/api/leaves/${appCancelId}`, {
    access: mgr.access,
    body: { status: "Approved", managerNote: "Approved" },
  });
  ok("S16b. Manager approves → 200", approvedForCancel.status === 200);

  const balBeforeRestore = await api("GET", "/api/leaves/balance", {
    access: emp.access,
  });
  const earnedBefore = balBeforeRestore.data.balances.find(
    (b) => b.type === "Earned Leave",
  );

  const restored = await api("PUT", `/api/leaves/${appCancelId}`, {
    access: emp.access,
    body: { status: "Cancelled" },
  });
  ok(
    "S16c. Employee cancels approved leave → 200",
    restored.status === 200 && restored.data.leave.status === "Cancelled",
  );

  const balAfterRestore = await api("GET", "/api/leaves/balance", {
    access: emp.access,
  });
  const earnedAfter = balAfterRestore.data.balances.find(
    (b) => b.type === "Earned Leave",
  );
  ok(
    "S16d. Balance restored after cancelling approved leave",
    earnedAfter.used === earnedBefore.used - 1,
  );

  // ========================================================================
  // SCENARIO 17: Two approvers cannot approve the same request twice
  // ========================================================================
  // Already tested in S6b (re-approving returns 400).
  // Also test that HR cannot approve what manager already approved.
  const mgrFinal = await api("PUT", `/api/leaves/${leaveId}`, {
    access: hr.access,
    body: { status: "Approved", managerNote: "HR double approve" },
  });
  ok(
    "S17. HR cannot re-approve manager-approved leave → 400",
    mgrFinal.status === 400,
  );

  // ========================================================================
  // SCENARIO 18: Unauthorized users cannot access other employees' requests
  // ========================================================================
  // Employee tries to access another employee's leave
  const mgrObjId = await employeeObjectId("CY0824SD301");
  const empObjId = await employeeObjectId("CY0525RS109");
  const otherEmpLeave = await api("GET", "/api/leaves", {
    access: mgr.access, // manager's list includes team
  });
  // Find a leave belonging to someone other than the manager and the employee
  const teamLeave = otherEmpLeave.data.leaves.find(
    (l) =>
      l.employee &&
      String(l.employee._id) !== String(mgrObjId) &&
      String(l.employee._id) !== String(empObjId),
  );
  if (teamLeave) {
    const empAccessOthers = await api("GET", `/api/leaves/${teamLeave._id}`, {
      access: emp.access,
    });
    ok(
      "S18. Employee cannot access another employee's leave → 403",
      empAccessOthers.status === 403,
    );
  } else {
    // No other team member's leave available; test with HR's leave instead
    const hrLeaveAccess = await api("GET", `/api/leaves/${hrOwnLeaveId}`, {
      access: emp.access,
    });
    ok(
      "S18. Employee cannot access HR's leave → 403",
      hrLeaveAccess.status === 403,
    );
  }

  // ========================================================================
  // SCENARIO 19: Changes persist after refresh / relogin
  // ========================================================================
  // Re-fetch the approved leave and verify status is still Approved
  const persisted = await api("GET", "/api/leaves", { access: emp.access });
  const persistedLeave = persisted.data.leaves.find(
    (l) => String(l._id) === String(hrLeaveId),
  );
  ok(
    "S19. Approved status persists on re-fetch → 200",
    persisted.status === 200 &&
      persistedLeave &&
      persistedLeave.status === "Approved",
  );

  // ========================================================================
  // SCENARIO 20: Notifications and audit history contain correct information
  // ========================================================================
  // Audit log
  const auditLog = await api("GET", "/api/audit", { access: admin.access });
  const leaveAudit = auditLog.data.logs.some(
    (a) => a.action && a.action.startsWith("leave."),
  );
  ok(
    "S20a. Audit log contains leave actions → 200",
    auditLog.status === 200 && leaveAudit,
  );

  // Notification content check
  const approverNotif = empNotifs.data.notifications.find(
    (n) =>
      n.type === "Leave Decision" &&
      n.metadata &&
      n.metadata.leaveId === hrLeaveId,
  );
  ok(
    "S20b. Notification has correct type and metadata → 200",
    !!approverNotif &&
      approverNotif.type === "Leave Decision" &&
      !!approverNotif.metadata &&
      !!approverNotif.metadata.leaveId,
  );

  // ========================================================================
  await disconnectDB();
  console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
  if (fails.length) {
    console.log("Failed:");
    fails.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});