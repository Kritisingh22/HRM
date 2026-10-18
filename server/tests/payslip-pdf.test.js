/* Payslip PDF endpoint tests — REAL app + REAL MongoDB (mongodb-memory-server),
 * authenticated with real JWTs issued by /api/auth/login.
 *
 *   node tests/payslip-pdf.test.js
 *
 * Covers the full security matrix of GET /api/payroll/:id/payslip/pdf:
 *   - employee downloads OWN payslip → 200 application/pdf, content matches DB
 *   - employee cannot download someone else's → 403
 *   - unauthenticated → 401, invalid id → 400, unknown id → 404
 *   - HR / Manager / Admin follow the existing payroll read scope
 *   - bank account is masked, no secrets, no client-controllable amounts
 *   - generating a PDF never modifies the payroll record
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";

const { MongoMemoryServer } = require("mongodb-memory-server");
const zlib = require("zlib");

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
  }
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const PORT = 5098;
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

/** Raw request that keeps the body as bytes (for PDF responses). */
async function apiRaw(method, path, { access } = {}) {
  const headers = {};
  if (access) headers.Authorization = "Bearer " + access;
  const res = await fetch(BASE + path, { method, headers });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buffer };
}

/**
 * Extract the drawn text from a pdf-lib document: inflate every content stream
 * and decode the hex-show-text operands. Enough to assert exactly what the
 * page displays — amounts, labels, references.
 */
function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  const streams = [];
  let idx = 0;
  while (true) {
    const s = raw.indexOf("stream", idx);
    if (s === -1) break;
    let start = s + "stream".length;
    if (raw[start] === "\r") start++;
    if (raw[start] === "\n") start++;
    const end = raw.indexOf("endstream", start);
    if (end === -1) break;
    try {
      const decoded = zlib.inflateSync(buffer.slice(start, end)).toString("latin1");
      if (decoded.includes("Tj")) streams.push(decoded);
    } catch {
      /* binary stream (image / object stream) — skip */
    }
    idx = end + "endstream".length;
  }
  const content = streams.join("\n");
  let text = "";
  const re = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let m;
  while ((m = re.exec(content))) {
    text += Buffer.from(m[1], "hex").toString("latin1") + "\n";
  }
  return text;
}

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const Payroll = require("../models/Payroll");
  const Employee = require("../models/Employee");

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const empB = await login("athul.raja@cyethack.com", "AthuCY0226AR110");
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    const manager = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");
    const admin = await login("admin@cyethack.com", "Admin@123");

    ok(
      "1. seed logins succeed for employee A/B, HR, manager and admin",
      [empA, empB, hr, manager, admin].every((s) => s.status === 200 && s.access),
    );

    // Locate the two seeded records through the scoped list endpoint.
    const listA = await apiRaw("GET", "/api/payroll", { access: empA.access });
    const payrollA = JSON.parse(listA.buffer.toString()).payroll.find(
      (p) => p.period === "2026-08",
    );
    const listB = await apiRaw("GET", "/api/payroll", { access: empB.access });
    const payrollB = JSON.parse(listB.buffer.toString()).payroll.find(
      (p) => p.period === "2026-08",
    );
    ok(
      "2. employee list returns own seeded payslips (CY0525RS109, CY0226AR110)",
      !!payrollA && !!payrollB && String(payrollA.employee.employeeId) === "CY0525RS109",
    );

    // Snapshot the record to prove PDF generation never mutates it.
    const before = await Payroll.findById(payrollA._id).lean();

    /* ---------------- happy path: employee downloads own payslip ---------------- */
    const own = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf", {
      access: empA.access,
    });
    ok(
      "3. employee A GET own /payslip/pdf → 200 application/pdf",
      own.status === 200 &&
        own.headers.get("content-type") === "application/pdf" &&
        own.buffer.slice(0, 5).toString() === "%PDF-",
    );
    ok(
      "4. Content-Disposition is inline with the safe filename",
      /^inline; filename="CYETHACK_Payslip_CY0525RS109_2026-08\.pdf"$/.test(
        own.headers.get("content-disposition") || "",
      ),
    );
    ok(
      "5. response is private/no-store (never cached by shared proxies)",
      (own.headers.get("cache-control") || "").includes("no-store"),
    );

    const textA = pdfText(own.buffer);
    ok(
      "6. PDF header: SALARY PAYSLIP, company name, payslip reference and period",
      textA.includes("SALARY PAYSLIP") &&
        textA.includes("CYETHACK Solution") &&
        textA.includes("SAL-AUG-2026-CY0525RS109") &&
        textA.includes("August 2026"),
    );
    ok(
      "7. PDF employee block uses the real DB identity",
      textA.includes("Gangarapu Rohith Sai Ganesh") &&
        textA.includes("CY0525RS109") &&
        textA.includes("Django Developer") &&
        textA.includes("Engineering"),
    );
    ok(
      "8. earnings/deductions match the stored record exactly",
      textA.includes("INR 25,000.00") && // gross
        textA.includes("Provident Fund (PF)") &&
        textA.includes("INR 4,500.00") &&
        textA.includes("Income Tax (TDS)") &&
        textA.includes("INR 5,000.00") &&
        textA.includes("Total deductions"),
    );
    ok(
      "9. net salary shown is the stored net (gross − deductions)",
      textA.includes("NET SALARY PAYABLE") && textA.includes("INR 15,500.00"),
    );
    ok(
      "10. payment status/date/mode/reference come from the record",
      textA.includes("Paid") &&
        textA.includes("01 Sep 2026") &&
        textA.includes("Bank Transfer") &&
        textA.includes("TXN20260901001") &&
        textA.includes("UTR2026090100123456"),
    );
    ok(
      "11. bank account is masked — only last 4 digits, never the full number",
      textA.includes("XXXXXX9012") && !textA.includes("32456789012"),
    );
    ok(
      "12. no server secrets or credentials leak into the PDF",
      !/passwordHash|\$2[aby]\$|eyJhbGciOi|Bearer |mongodb:\/\//i.test(textA),
    );
    ok(
      "13. footer: computer-generated notice + page numbering",
      textA.includes("Computer-generated payslip - no signature required.") &&
        textA.includes("Page 1 of 1"),
    );

    const after = await Payroll.findById(payrollA._id).lean();
    ok(
      "14. generating the PDF does not modify the payroll record",
      JSON.stringify({ ...before, _id: String(before._id) }) ===
        JSON.stringify({ ...after, _id: String(after._id) }) &&
        before.fileKey === undefined &&
        after.fileKey === undefined,
    );

    /* ---------------- attachment / download mode ---------------- */
    const dl = await apiRaw(
      "GET",
      "/api/payroll/" + payrollA._id + "/payslip/pdf?download=1",
      { access: empA.access },
    );
    ok(
      "15. ?download=1 forces an attachment with the same safe filename",
      dl.status === 200 &&
        /^attachment; filename="CYETHACK_Payslip_CY0525RS109_2026-08\.pdf"$/.test(
          dl.headers.get("content-disposition") || "",
        ),
    );
    const dl2 = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/download", {
      access: empA.access,
    });
    ok(
      "16. legacy /download route streams the same PDF as an attachment",
      dl2.status === 200 &&
        dl2.buffer.slice(0, 5).toString() === "%PDF-" &&
        /^attachment/.test(dl2.headers.get("content-disposition") || ""),
    );

    /* ---------------- client tampering cannot change amounts ---------------- */
    const tampered = await apiRaw(
      "GET",
      "/api/payroll/" + payrollA._id + "/payslip/pdf?gross=999999&net=999999&employeeId=CY9999XX999",
      { access: empA.access },
    );
    const textTampered = pdfText(tampered.buffer);
    ok(
      "17. query parameters cannot alter identity or amounts on the PDF",
      tampered.status === 200 &&
        textTampered.includes("INR 15,500.00") &&
        !textTampered.includes("999,999.00") &&
        !textTampered.includes("CY9999XX999"),
    );

    /* ---------------- cross-record: B's payslip is a different document ---------------- */
    const ownB = await apiRaw("GET", "/api/payroll/" + payrollB._id + "/payslip/pdf", {
      access: empB.access,
    });
    const textB = pdfText(ownB.buffer);
    ok(
      "18. employee B's PDF matches B's record (structure breakdown reconciled)",
      ownB.status === 200 &&
        textB.includes("Athul Rajagopalan P") &&
        textB.includes("INR 75,000.00") &&
        textB.includes("Basic salary") &&
        textB.includes("House rent allowance (HRA)") &&
        textB.includes("INR 65,500.00") &&
        !textB.includes("INR 15,500.00"),
    );

    /* ---------------- object-level authorization ---------------- */
    const cross = await apiRaw("GET", "/api/payroll/" + payrollB._id + "/payslip/pdf", {
      access: empA.access,
    });
    ok("19. employee A cannot download employee B's payslip → 403", cross.status === 403);

    const crossBack = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf", {
      access: empB.access,
    });
    ok("20. employee B cannot download employee A's payslip → 403", crossBack.status === 403);

    const anon = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf");
    ok("21. unauthenticated request → 401", anon.status === 401);

    const badToken = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf", {
      access: "demo.abcdef.not-a-real-token",
    });
    ok("22. forged/demo token → 401", badToken.status === 401);

    const badId = await apiRaw("GET", "/api/payroll/not-an-id/payslip/pdf", {
      access: empA.access,
    });
    const mongoose = require("mongoose");
    const missingId = await apiRaw(
      "GET",
      "/api/payroll/" + new mongoose.Types.ObjectId().toString() + "/payslip/pdf",
      { access: empA.access },
    );
    ok(
      "23. invalid id → 400 (controlled), unknown id → 404 (controlled)",
      badId.status === 400 && missingId.status === 404,
    );
    ok(
      "24. error responses are JSON, not PDF or stack traces",
      (badId.headers.get("content-type") || "").includes("application/json") &&
        (missingId.headers.get("content-type") || "").includes("application/json") &&
        !badId.buffer.toString().includes("at "),
    );

    /* ---------------- HR / Manager / Admin scopes ---------------- */
    const hrA = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf", {
      access: hr.access,
    });
    const hrB = await apiRaw("GET", "/api/payroll/" + payrollB._id + "/payslip/pdf", {
      access: hr.access,
    });
    ok(
      "25. HR (assigned to both employees) downloads their payslips → 200",
      hrA.status === 200 && hrB.status === 200,
    );

    const mgrA = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf", {
      access: manager.access,
    });
    ok("26. manager downloads a direct report's payslip → 200", mgrA.status === 200);

    const adminA = await apiRaw("GET", "/api/payroll/" + payrollA._id + "/payslip/pdf", {
      access: admin.access,
    });
    ok("27. admin downloads any non-management payslip → 200", adminA.status === 200);

    /* ---------------- outside-the-team record ---------------- */
    const outsider = await Employee.create({
      employeeId: "CY9001XX999",
      fullName: "Outside Scope",
      email: "outside.scope@cyethack.com",
      department: "Engineering",
      designation: "Analyst",
      assignedHrId: null,
      manager: null,
      salary: 10000,
      status: "Active",
    });
    const outsiderPay = await Payroll.create({
      employee: outsider._id,
      period: "2026-08",
      gross: 10000,
      deductions: { pf: 1000, tds: 500 },
      status: "Approved",
      reference: "SAL-AUG-2026-CY9001XX999",
    });

    const mgrOut = await apiRaw(
      "GET",
      "/api/payroll/" + outsiderPay._id + "/payslip/pdf",
      { access: manager.access },
    );
    const empOut = await apiRaw(
      "GET",
      "/api/payroll/" + outsiderPay._id + "/payslip/pdf",
      { access: empA.access },
    );
    const hrOut = await apiRaw("GET", "/api/payroll/" + outsiderPay._id + "/payslip/pdf", {
      access: hr.access,
    });
    const adminOut = await apiRaw(
      "GET",
      "/api/payroll/" + outsiderPay._id + "/payslip/pdf",
      { access: admin.access },
    );
    ok(
      "28. manager/employee/HR outside scope → 403, admin still → 200",
      mgrOut.status === 403 &&
        empOut.status === 403 &&
        hrOut.status === 403 &&
        adminOut.status === 200,
    );

    /* ---------------- management-department exclusion ---------------- */
    const mgmtEmp = await Employee.create({
      employeeId: "CY8001MG001",
      fullName: "Management Person",
      email: "management@cyethack.com",
      department: "Management",
      designation: "Director",
      status: "Active",
    });
    const mgmtPay = await Payroll.create({
      employee: mgmtEmp._id,
      period: "2026-08",
      gross: 200000,
      deductions: { pf: 0, tds: 50000 },
      status: "Approved",
    });
    const adminMgmt = await apiRaw(
      "GET",
      "/api/payroll/" + mgmtPay._id + "/payslip/pdf",
      { access: admin.access },
    );
    ok(
      "29. even admin cannot obtain Management-department payslips → 403",
      adminMgmt.status === 403,
    );

    /* ---------------- long values / absent optionals don't break rendering ---------------- */
    const longEmp = await Employee.create({
      employeeId: "CY7001LONGVALUE",
      fullName: "A".repeat(120) + " Very Long Name",
      email: "long.name@cyethack.com",
      department: "Engineering",
      designation: "Senior Principal Staff Engineer With A Very Long Designation Title",
      assignedHrId: null,
      manager: null,
      status: "Active",
    });
    const longPay = await Payroll.create({
      employee: longEmp._id,
      period: "2026-09",
      gross: 1234567.89,
      deductions: { pf: 0, tds: 0, esi: 0, other: 0.5 },
      status: "Draft",
    });
    const longRes = await apiRaw(
      "GET",
      "/api/payroll/" + longPay._id + "/payslip/pdf",
      { access: admin.access },
    );
    const textLong = pdfText(longRes.buffer);
    ok(
      "30. long names, big amounts, zero deductions and missing optionals render",
      longRes.status === 200 &&
        longRes.buffer.slice(0, 5).toString() === "%PDF-" &&
        textLong.includes("INR 12,34,567.89") &&
        textLong.includes("INR 12,34,567.39") && // net = gross − 0.50
        textLong.includes("September 2026") &&
        textLong.includes("..."), // long name/designation was ellipsised, not dropped
    );

    ok("31. no fabricated PDFs: Draft payslips carry no pay date, UTR or transaction id",
      !textLong.includes("UTR") && !textLong.includes("Transaction reference"));
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
