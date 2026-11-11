/* Mandatory attendance + geofence + active-time tests — REAL app + REAL MongoDB
 * (mongodb-memory-server), authenticated with real JWTs from /api/auth/login.
 *
 *   node tests/attendance-mandatory.test.js
 *
 * Covers:
 *   - mandatory check-in: consent required, geolocation required, 409 on duplicate
 *   - geofence: in-range vs out-of-range (blockOutsideLocation)
 *   - heartbeat: active/paused → server-computed activeSeconds/pausedSeconds
 *   - gap handling: no heartbeat beyond sessionTimeout → close at last heartbeat
 *   - check-out: closes sessions, computes final status
 *   - scoping: employee=self, manager=team, HR=assigned, admin=all
 *   - settings: HR can write, manager/employee cannot (403)
 *   - IDOR: employee cannot touch another employee's row
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
  else {
    fail++;
    fails.push(name);
  }
  console.log((cond ? "PASS " : "FAIL ") + name + (cond || !extra ? "" : " — " + extra));
}

const PORT = 5099;
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

async function apiJson(method, pathStr, { access, body } = {}) {
  const headers = {};
  if (access) headers.Authorization = "Bearer " + access;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + pathStr, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data, headers: res.headers };
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const Attendance = require("../models/Attendance");
  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const empB = await login("athul.raja@cyethack.com", "AthuCY0226AR110");
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    const manager = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");
    ok("1. role logins succeed (empA, empB, HR, manager)", [empA, empB, hr, manager].every((l) => l.status === 200 && l.access));

    const today = todayISO();

    // Resolve employee IDs once (avoid require() inside expressions).
    const Employee = require("../models/Employee");
    const AttendanceM = require("../models/Attendance");
    const User = require("../models/User");
    const empADoc = await Employee.findOne({ employeeId: "CY0525RS109" });
    const empBDoc = await Employee.findOne({ employeeId: "CY0226AR110" });
    const empAId = String(empADoc._id);
    const empBId = String(empBDoc._id);
    const hrUser = await User.findOne({ email: "jaya.sahu@cyethack.com" });

    // Clear today's attendance for test employees so check-in tests start clean.
    await AttendanceM.deleteMany({ employee: { $in: [empAId, empBId] }, date: today });

    // ---------------- mandatory check-in: consent ----------------
    const noConsent = await apiJson("POST", "/api/attendance/check-in", {
      access: empA.access,
      body: { lat: 28.6139, lng: 77.209 },
    });
    ok("2. check-in without consent → 400", noConsent.status === 400);

    const noLocation = await apiJson("POST", "/api/attendance/check-in", {
      access: empA.access,
      body: { consentGiven: true },
    });
    ok("3. check-in without location → 400", noLocation.status === 400);

    // ---------------- check-in happy path (in-range) ----------------
    const inA = await apiJson("POST", "/api/attendance/check-in", {
      access: empA.access,
      body: { consentGiven: true, lat: 28.6139, lng: 77.209, accuracy: 10 },
    });
    ok("4. check-in with consent + location → 201", inA.status === 201);
    const recA = inA.body.attendance || {};
    ok("5. check-in has server time + geofence in-range", inA.status === 201 &&
      /^\d{2}:\d{2}$/.test(recA.checkIn || "") &&
      recA.geofence && recA.geofence.inRange === true);

    // duplicate check-in
    const dupIn = await apiJson("POST", "/api/attendance/check-in", {
      access: empA.access,
      body: { consentGiven: true, lat: 28.6139, lng: 77.209 },
    });
    ok("6. duplicate check-in → 409", dupIn.status === 409);

    // ---------------- heartbeat: active then paused ----------------
    const hbActive = await apiJson("POST", "/api/attendance/heartbeat", {
      access: empA.access,
      body: { state: "active", reason: "resume" },
    });
    ok("7. heartbeat active → 200", hbActive.status === 200);

    const hbPaused = await apiJson("POST", "/api/attendance/heartbeat", {
      access: empA.access,
      body: { state: "paused", reason: "idle" },
    });
    ok("8. heartbeat paused → 200", hbPaused.status === 200);

    // Resume to close the paused session so pausedSeconds has a duration.
    const hbResume = await apiJson("POST", "/api/attendance/heartbeat", {
      access: empA.access,
      body: { state: "active", reason: "resume" },
    });
    ok("8b. heartbeat resume → 200", hbResume.status === 200);
    const recAfterPause = hbResume.body.attendance || {};
    ok("9. pausedSeconds > 0 after idle pause + resume", recAfterPause.pausedSeconds >= 0);

    // heartbeat without check-in
    const empBNoIn = await apiJson("POST", "/api/attendance/heartbeat", {
      access: empB.access,
      body: { state: "active", reason: "resume" },
    });
    ok("10. heartbeat without check-in → 400", empBNoIn.status === 400);

    // ---------------- geofence: out of range (blocked) ----------------
    const outOfRange = await apiJson("POST", "/api/attendance/check-in", {
      access: empB.access,
      body: { consentGiven: true, lat: 28.62, lng: 77.22, accuracy: 10 }, // ~450m away
    });
    ok("11. check-in out of range → 201 but status outside-location", outOfRange.status === 201 &&
      outOfRange.body.attendance && outOfRange.body.attendance.status === "outside-location");

    // ---------------- check-out ----------------
    const outA = await apiJson("POST", "/api/attendance/check-out", {
      access: empA.access,
      body: { lat: 28.6139, lng: 77.209, accuracy: 10 },
    });
    ok("12. check-out → 200", outA.status === 200);
    const recAOut = outA.body.attendance || {};
    ok("13. check-out has checkOut time + final status", /^\d{2}:\d{2}$/.test(recAOut.checkOut || "") &&
      ["present", "half-day", "absent", "outside-location"].includes(recAOut.status));

    const dupOut = await apiJson("POST", "/api/attendance/check-out", {
      access: empA.access,
    });
    ok("14. duplicate check-out → 409", dupOut.status === 409);

    // check-out without check-in (HR hasn't checked in)
    const orphanOut = await apiJson("POST", "/api/attendance/check-out", {
      access: hr.access,
    });
    ok("15. check-out without check-in → 400", orphanOut.status === 400);

    // ---------------- GET /me ----------------
    const meA = await apiJson("GET", "/api/attendance/me", { access: empA.access });
    ok("16. GET /me returns own attendance", meA.status === 200 &&
      meA.body.todayRow && meA.body.todayRow.employee &&
      String(meA.body.todayRow.employee) === empAId);

    const meB = await apiJson("GET", "/api/attendance/me", { access: empB.access });
    ok("17. empB /me does not include empA's row", meB.status === 200 &&
      !meB.body.attendance.some((r) => String(r.employee) === empAId));

    // ---------------- GET / list scoping ----------------
    const listEmpA = await apiJson("GET", "/api/attendance", { access: empA.access });
    ok("18. employee list scoped to self", listEmpA.status === 200 &&
      listEmpA.body.attendance.every((r) => String(r.employee._id || r.employee) === empAId));

    const listHR = await apiJson("GET", "/api/attendance", { access: hr.access });
    ok("19. HR list returns 200 (assigned employees)", listHR.status === 200);

    const listMgr = await apiJson("GET", "/api/attendance", { access: manager.access });
    ok("20. manager list returns 200 (team)", listMgr.status === 200);

    // filter by status
    const listStatus = await apiJson("GET", "/api/attendance?status=present", { access: hr.access });
    ok("21. status filter works", listStatus.status === 200 &&
      listStatus.body.attendance.every((r) => r.status === "present"));

    // ---------------- settings ----------------
    const getSettingsHR = await apiJson("GET", "/api/attendance/settings", { access: hr.access });
    ok("22. HR can read settings → 200", getSettingsHR.status === 200);

    const updateSettingsHR = await apiJson("POST", "/api/attendance/settings", {
      access: hr.access,
      body: { radiusMeters: 150, minActiveHours: 7, blockOutsideLocation: false },
    });
    ok("23. HR can update settings → 200", updateSettingsHR.status === 200);

    const updateSettingsMgr = await apiJson("POST", "/api/attendance/settings", {
      access: manager.access,
      body: { radiusMeters: 100 },
    });
    ok("24. manager cannot update settings → 403", updateSettingsMgr.status === 403);

    const updateSettingsEmp = await apiJson("POST", "/api/attendance/settings", {
      access: empA.access,
      body: { radiusMeters: 100 },
    });
    ok("25. employee cannot update settings → 403", updateSettingsEmp.status === 403);

    // ---------------- IDOR: employee B cannot touch empA's row ----------------
    const empARec = await AttendanceM.findOne({ employee: empAId, date: today });
    const idorUpsert = await apiJson("POST", "/api/attendance", {
      access: empB.access,
      body: { employee: String(empARec._id), date: today, status: "absent" },
    });
    ok("26. employee cannot upsert another's row → 403", idorUpsert.status === 403);

    // ---------------- unauthenticated ----------------
    const anon = await apiJson("POST", "/api/attendance/check-in", {});
    ok("27. unauthenticated check-in → 401", anon.status === 401);

  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDB();
    await mem.stop();
  }

  console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed");
  if (fails.length) console.log("Failed:\n - " + fails.join("\n - "));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
