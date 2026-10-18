/* Payroll generation — REAL app + REAL MongoDB (mongodb-memory-server).
 *
 *   node tests/payroll-generate.test.js
 *
 * Locks in the console workflow the portal drives:
 *   - POST /api/payroll/generate computes from the employee's ACTIVE salary
 *     structure, including Map-typed allowances/deductions (regression: the
 *     calculation used to produce NaN / zeroed amounts)
 *   - duplicate period → 409, regenerate:true replaces the draft
 *   - employees with no salary → 400 (never a fake slip)
 *   - permission matrix: manager 403, employee cannot self-approve
 *   - PUT /api/payroll/:id honours status/payDate/deductions ONLY — payment
 *     reference fields cannot be injected by the client
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

const PORT = 5097;
const BASE = "http://localhost:" + PORT;

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, access: body.accessToken };
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
    const admin = await login("admin@cyethack.com", "Admin@123");
    const manager = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");
    const emp = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok(
      "1. seed logins succeed (admin, manager, employee, HR)",
      [admin, manager, emp, hr].every((s) => s.status === 200 && s.access),
    );

    const emps = await api("GET", "/api/employees", { access: admin.access });
    const rohith = (emps.body.employees || []).find((e) => e.employeeId === "CY0525RS109");
    const unpaid = (emps.body.employees || []).find((e) => e.employeeId === "CY0000AD001");
    ok("2. admin sees the roster (payable + no-salary accounts)", Boolean(rohith && unpaid));

    /* ---------------- generation math from the seeded structure ---------------- */
    const gen = await api("POST", "/api/payroll/generate", {
      access: admin.access,
      body: { employee: rohith._id, period: "2026-10" },
    });
    const slip = gen.body.payslip || {};
    ok(
      "3. generate → 201 Draft from the salary structure (gross 23,500 incl. allowances)",
      gen.status === 201 && slip.status === "Draft" && slip.gross === 23500,
      `status=${gen.status} gross=${slip.gross}`,
    );
    ok(
      "4. deductions are the structure values (PF 3,600 / TDS 2,000), net 17,900",
      slip.deductions &&
        slip.deductions.pf === 3600 &&
        slip.deductions.tds === 2000 &&
        slip.net === 17900,
      JSON.stringify(slip.deductions),
    );

    const dup = await api("POST", "/api/payroll/generate", {
      access: admin.access,
      body: { employee: rohith._id, period: "2026-10" },
    });
    ok("5. duplicate period without regenerate → 409", dup.status === 409);

    const regen = await api("POST", "/api/payroll/generate", {
      access: admin.access,
      body: { employee: rohith._id, period: "2026-10", regenerate: true },
    });
    const list = await api("GET", "/api/payroll", { access: admin.access });
    const october = (list.body.payroll || []).filter(
      (p) => p.period === "2026-10" && String(p.employee.employeeId) === "CY0525RS109",
    );
    ok("6. regenerate:true replaces the draft (exactly one row remains)", regen.status === 201 && october.length === 1);
    const slipId = regen.body.payslip._id;

    /* ---------------- unpavable / invalid input ---------------- */
    const noSalary = await api("POST", "/api/payroll/generate", {
      access: admin.access,
      body: { employee: unpaid._id, period: "2026-10" },
    });
    ok(
      "7. employee without salary → 400 with a clear reason (no fake slip)",
      noSalary.status === 400 && /salary/i.test(noSalary.body.error || ""),
      JSON.stringify(noSalary.body).slice(0, 160),
    );
    const missing = await api("POST", "/api/payroll/generate", {
      access: admin.access,
      body: { employee: rohith._id },
    });
    ok("8. missing period → 400", missing.status === 400);

    /* ---------------- permission matrix ---------------- */
    const mgrGen = await api("POST", "/api/payroll/generate", {
      access: manager.access,
      body: { employee: rohith._id, period: "2026-10", regenerate: true },
    });
    ok("9. manager has no payroll write access → 403", mgrGen.status === 403);

    const empPut = await api("PUT", "/api/payroll/" + slipId, {
      access: emp.access,
      body: { status: "Processed" },
    });
    const listAfterEmp = await api("GET", "/api/payroll", { access: admin.access });
    const stillDraft = (listAfterEmp.body.payroll || []).find((p) => String(p._id) === String(slipId));
    ok(
      "10. employee cannot self-approve payroll → 403, status unchanged",
      empPut.status === 403 && stillDraft.status === "Draft",
    );

    /* ---------------- console status flow + field whitelist ---------------- */
    const appr = await api("PUT", "/api/payroll/" + slipId, {
      access: admin.access,
      body: { status: "Approved" },
    });
    const proc = await api("PUT", "/api/payroll/" + slipId, {
      access: admin.access,
      body: { status: "Processed", payDate: "2026-10-31" },
    });
    ok(
      "11. Draft → Approved → Processed with payDate lands server-side",
      appr.status === 200 && appr.body.payslip.status === "Approved" && proc.status === 200 && proc.body.payslip.status === "Processed",
    );

    const fake = await api("PUT", "/api/payroll/" + slipId, {
      access: admin.access,
      body: {
        transactionId: "FAKE-TXN-1",
        reference: "HACK",
        utr: "FAKE-UTR",
        status: "Processed",
      },
    });
    ok(
      "12. client-supplied payment references are ignored by the update",
      fake.status === 200 && !fake.body.payslip.transactionId && !fake.body.payslip.reference && !fake.body.payslip.utr,
      JSON.stringify({ t: fake.body.payslip.transactionId, r: fake.body.payslip.reference, u: fake.body.payslip.utr }),
    );

    /* ---------------- selected-employee alias route (previously ungated) ---------------- */
    const empAlias = await api("POST", "/api/payroll/employee/CY0525RS109/generate", {
      access: emp.access,
      body: { period: "2026-10" },
    });
    ok(
      "13. employee cannot generate payslips, even their own → 403 with payroll:write enforced on the alias route",
      empAlias.status === 403,
      `status=${empAlias.status}`,
    );

    const mgrAlias = await api("POST", "/api/payroll/employee/CY0226AR110/generate", {
      access: manager.access,
      body: { period: "2026-10" },
    });
    ok(
      "14. manager without payroll:write cannot generate for the team → 403",
      mgrAlias.status === 403,
      `status=${mgrAlias.status}`,
    );

    const hrAlias = await api("POST", "/api/payroll/employee/CY0525RS109/generate", {
      access: hr.access,
      body: { period: "2026-10", regenerate: true },
    });
    ok(
      "15. HR (payroll:write + in scope) still generates via the alias route → 201 with structure math",
      hrAlias.status === 201 && (hrAlias.body.payslip || {}).gross === 23500,
      `status=${hrAlias.status} gross=${(hrAlias.body.payslip || {}).gross}`,
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
