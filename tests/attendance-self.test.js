/* Self-service attendance endpoints — REAL app + REAL MongoDB
 * (mongodb-memory-server), authenticated with real JWTs from /api/auth/login.
 *
 *   node tests/attendance-self.test.js
 *
 * Covers POST /api/attendance/check-in and /api/attendance/check-out:
 *   - unauthenticated → 401
 *   - check-in / check-out happy paths with SERVER timestamps and date
 *   - duplicate check-in / check-out → 409, orphan check-out → 400
 *   - identity always comes from the token: a hostile body naming a
 *     different employee or another date/time is ignored
 *   - unique-per-day records (no double rows)
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

const PORT = 5096;
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
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const todayRow = (attendance) => (attendance || []).find((a) => a.date === todayISO());
const empIdOf = (row) => String(row.employee && row.employee._id ? row.employee._id : row.employee);

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
    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const empB = await login("athul.raja@cyethack.com", "AthuCY0226AR110");
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok(
      "1. seed logins succeed (employee A/B, HR)",
      [empA, empB, hr].every((s) => s.status === 200 && s.access),
    );

    /* ---------------- unauthenticated ---------------- */
    const anon = await api("POST", "/api/attendance/check-in", {});
    const badToken = await api("POST", "/api/attendance/check-out", {
      access: "not-a-token",
    });
    ok("2. no/invalid token → 401 on check-in and check-out", anon.status === 401 && badToken.status === 401);

    /* ---------------- check-in happy path ---------------- */
    const before = await api("GET", "/api/attendance/me", { access: empA.access });
    ok("3. employee A starts with no attendance row for today", !todayRow(before.body.attendance));

    const inA = await api("POST", "/api/attendance/check-in", { access: empA.access });
    const recA = inA.body.attendance || {};
    ok(
      "4. check-in → 201 with a server timestamp for today",
      inA.status === 201 &&
        recA.date === todayISO() &&
        /^\d{2}:\d{2}$/.test(recA.checkIn || "") &&
        recA.status === "present" &&
        !recA.checkOut,
      JSON.stringify(recA).slice(0, 200),
    );

    const dupIn = await api("POST", "/api/attendance/check-in", { access: empA.access });
    ok("5. duplicate check-in → 409", dupIn.status === 409);

    /* ---------------- identity comes from the token only ---------------- */
    /* A's own record id, then B tries to write A's record via the body. */
    const listA1 = await api("GET", "/api/attendance/me", { access: empA.access });
    const rowA1 = todayRow(listA1.body.attendance);
    const aId = empIdOf(rowA1);

    const idor = await api("POST", "/api/attendance/check-in", {
      access: empB.access,
      body: { employee: aId, status: "present", date: "2000-01-01", checkIn: "00:00" },
    });
    const listA2 = await api("GET", "/api/attendance/me", { access: empA.access });
    const listB2 = await api("GET", "/api/attendance/me", { access: empB.access });
    const rowsA = (listA2.body.attendance || []).filter((a) => a.date === todayISO());
    const rowsB = (listB2.body.attendance || []).filter((a) => a.date === todayISO());
    ok(
      "6. hostile body (other employee / other date) is ignored — B wrote exactly its own row",
      idor.status === 201 &&
        rowsB.length === 1 &&
        empIdOf(rowsB[0]) !== aId &&
        rowsA.length === 1 &&
        empIdOf(rowsA[0]) === aId,
      `idor=${idor.status} a=${rowsA.length} b=${rowsB.length}`,
    );

    /* ---------------- check-out happy path ---------------- */
    const outA = await api("POST", "/api/attendance/check-out", { access: empA.access });
    ok(
      "7. check-out → 200 with a server timestamp on today's row",
      outA.status === 200 && /^\d{2}:\d{2}$/.test((outA.body.attendance || {}).checkOut || ""),
      JSON.stringify(outA.body).slice(0, 200),
    );

    const dupOut = await api("POST", "/api/attendance/check-out", { access: empA.access });
    ok("8. duplicate check-out → 409", dupOut.status === 409);

    const orphanOut = await api("POST", "/api/attendance/check-out", {
      access: hr.access,
    });
    const listHR = await api("GET", "/api/attendance/me", { access: hr.access });
    const rowHR = todayRow(listHR.body.attendance);
    ok(
      "9. check-out without a check-in → 400 and no row is created",
      orphanOut.status === 400 && !rowHR,
      `status=${orphanOut.status}`,
    );

    /* ---------------- server-owned fields cannot be spoofed ---------------- */
    const hrIn = await api("POST", "/api/attendance/check-in", {
      access: hr.access,
      body: { status: "wfh", checkIn: "00:00", checkOut: "23:59", date: "2000-01-01" },
    });
    const recHr = hrIn.body.attendance || {};
    ok(
      "10. client timestamps/dates are ignored; only the wfh flag is honoured",
      hrIn.status === 201 &&
        recHr.status === "wfh" &&
        recHr.date === todayISO() &&
        /^\d{2}:\d{2}$/.test(recHr.checkIn || "") &&
        recHr.checkIn !== "00:00" &&
        !recHr.checkOut,
      JSON.stringify(recHr).slice(0, 200),
    );

    /* ---------------- persistence + scoping ---------------- */
    const finalA = await api("GET", "/api/attendance/me", { access: empA.access });
    const finalRowA = todayRow(finalA.body.attendance);
    ok(
      "11. A's record persists with both check-in and check-out",
      Boolean(finalRowA && finalRowA.checkIn && finalRowA.checkOut),
    );

    const otherSessions = await api("GET", "/api/sessions", { access: empB.access });
    ok(
      "12. check-in responses leak no credentials/tokens",
      !("password" in recA) && !("accessToken" in recA) && otherSessions.status === 200,
    );
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
