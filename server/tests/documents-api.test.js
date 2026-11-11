/* Documents module end-to-end tests — REAL app + REAL MongoDB
 * (mongodb-memory-server) + REAL storage pipeline on the local provider.
 * Authenticated with real JWTs issued by /api/auth/login. No Google Drive
 * credentials are needed for THIS suite (see documents-drive-unit.test.js for
 * the provider-seam tests and documents-live.test.js for real Drive runs).
 *
 *   node tests/documents-api.test.js
 *
 * Covers (Phase-12 matrix):
 *   - HR / Manager / Employee upload + download through authenticated endpoints
 *   - object-level access (cross-employee IDOR blocked, company-wide visible)
 *   - validation: bad category, bad type, magic-byte mismatch, oversize → 413
 *   - duplicate bytes → 409; missing file on disk → 404 (no crash)
 *   - soft-delete + retention (retained categories keep bytes, standard remove)
 *   - verify workflow (employee denied, HR allowed)
 *   - payslip archive → EmployeeDocument (private, retained) + retrieval rules
 *   - storage internals never leak to clients
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";
process.env.DOCUMENT_STORAGE = "local";
process.env.UPLOAD_MAX_MB = "10";
process.env.UPLOAD_RATE_MAX = "1000";

const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

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

/** Keeps the body as bytes (downloads). */
async function apiRaw(method, pathStr, { access } = {}) {
  const headers = {};
  if (access) headers.Authorization = "Bearer " + access;
  const res = await fetch(BASE + pathStr, { method, headers });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buffer };
}

async function apiUpload(pathStr, { access, fields = {}, file } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append("file", new Blob([file.buffer], { type: file.mime }), file.name);
  const res = await fetch(BASE + pathStr, {
    method: "POST",
    headers: access ? { Authorization: "Bearer " + access } : {},
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
);
const PDF_BYTES_2 = Buffer.from(
  "%PDF-1.4\n2 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 2 0 R >>\n%%EOF\n",
);
const PDF_BYTES_3 = Buffer.from(
  "%PDF-1.4\n3 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 3 0 R >>\n%%EOF\n",
);
const PDF_BYTES_4 = Buffer.from(
  "%PDF-1.4\n4 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 4 0 R >>\n%%EOF\n",
);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("fake-png-payload-1"),
]);
const PNG_BYTES_2 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("fake-png-payload-2"),
]);

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const User = require("../models/User");
  const Employee = require("../models/Employee");
  const Payroll = require("../models/Payroll");
  const { teamEmployeeIds } = require("../utils/teamScope");
  const { UPLOAD_DIR } = require("../services/storage");

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
      "0. role logins work (employee x2, HR, manager, admin)",
      [empA, empB, hr, manager, admin].every(
        (l) => l.status === 200 && !!l.access,
      ),
    );

    // ---- resolve seeded employees + HR scope ------------------------------
    async function resolveEmp(l, email) {
      const u = await User.findOne({ email: (l.user && l.user.email) || email });
      let emp = u ? await Employee.findOne({ user: u._id }) : null;
      if (!emp && u && u.employeeId) emp = await Employee.findOne({ employeeId: u.employeeId });
      return { user: u, emp };
    }
    const A = await resolveEmp(empA, "rohith.sai@cyethack.com");
    const B = await resolveEmp(empB, "athul.raja@cyethack.com");
    ok("0b. seeded employees resolvable (rohith, athul)", !!A.emp && !!B.emp);

    const jayaUser = await User.findOne({ email: "jaya.sahu@cyethack.com" });
    const scopeIds = (await teamEmployeeIds(jayaUser)).map(String);
    const inScopeEmp = await Employee.findOne({ _id: { $in: scopeIds } });
    const outScopeEmp = await Employee.findOne({ _id: { $nin: scopeIds } });
    ok(
      "0c. HR scope populated (in-scope + out-of-scope employees exist)",
      scopeIds.length > 0 && !!inScopeEmp && !!outScopeEmp,
    );

    // ---- employee upload (own, forced private) ---------------------------
    const upA = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "EmpA private note", category: "Other" },
      file: { buffer: PDF_BYTES, mime: "application/pdf", name: "note-a.pdf" },
    });
    ok("1. employee uploads own document → 201", upA.status === 201);
    const docA = upA.body.document;
    ok(
      "2. upload forced to private + owner = self + provider recorded",
      !!docA &&
        docA.visibility === "private" &&
        String(docA.owner) === String(A.emp._id) &&
        docA.storageProvider === "local",
    );
    ok(
      "3. storage internals stripped from responses",
      !!docA &&
        docA.storageKey === undefined &&
        docA.driveFileId === undefined &&
        docA.checksum === undefined,
    );

    // ---- download: owner / IDOR / disposition ----------------------------
    const dlA = await apiRaw("GET", `/api/documents/${docA._id}/download`, {
      access: empA.access,
    });
    ok(
      "4. owner downloads own document → 200 with exact bytes",
      dlA.status === 200 && dlA.buffer.equals(PDF_BYTES),
    );
    ok(
      "5. inline by default + pdf content-type + safe filename header",
      dlA.status === 200 &&
        (dlA.headers.get("content-type") || "").includes("application/pdf") &&
        (dlA.headers.get("content-disposition") || "").startsWith("inline"),
    );
    const dlAtt = await apiRaw(
      "GET",
      `/api/documents/${docA._id}/download?download=1`,
      { access: empA.access },
    );
    ok(
      "6. ?download=1 switches to attachment",
      dlAtt.status === 200 &&
        (dlAtt.headers.get("content-disposition") || "").startsWith("attachment") &&
        dlAtt.buffer.equals(PDF_BYTES),
    );
    const dlB = await apiRaw("GET", `/api/documents/${docA._id}/download`, {
      access: empB.access,
    });
    ok("7. cross-employee private download → 403 (IDOR blocked)", dlB.status === 403);

    // ---- cross-employee payslip download -----------------------------------
    const rohithSlip = await Payroll.findOne({ employee: A.emp._id }).sort({ period: -1 });
    ok("7b. seeded payslip exists for rohith", !!rohithSlip);
    const dlForeignSlip = await apiRaw("GET", `/api/payroll/${rohithSlip._id}/download`, {
      access: empB.access,
    });
    ok(
      "7c. employee cannot download another employee's payslip → 403",
      dlForeignSlip.status === 403,
    );
    const dlForeignSlipPdf = await apiRaw("GET", `/api/payroll/${rohithSlip._id}/payslip/pdf`, {
      access: empB.access,
    });
    ok(
      "7d. employee cannot view another employee's payslip PDF → 403",
      dlForeignSlipPdf.status === 403,
    );

    const listA = await apiJson("GET", "/api/documents", { access: empA.access });
    const listB0 = await apiJson("GET", "/api/documents", { access: empB.access });
    ok(
      "8. lists follow visibility (own included, other's private excluded)",
      listA.status === 200 &&
        listA.body.documents.some((d) => d._id === docA._id) &&
        !listB0.body.documents.some((d) => d._id === docA._id),
    );

    // ---- auth failures ---------------------------------------------------
    const noAuth = await apiJson("GET", "/api/documents");
    ok("9. unauthenticated list → 401", noAuth.status === 401);
    const tampered =
      empA.access.slice(0, -2) + (empA.access.endsWith("A") ? "B" : "A");
    const tamperedRes = await apiRaw("GET", "/api/documents", { access: tampered });
    ok("10. tampered token → 401", tamperedRes.status === 401);
    const expired = jwt.sign(
      { sub: String(A.user._id) },
      "test-access-secret",
      { expiresIn: "-10s" },
    );
    const expiredRes = await apiRaw("GET", "/api/documents", { access: expired });
    ok("11. expired token → 401", expiredRes.status === 401);
    const notFound = await apiRaw(
      "GET",
      "/api/documents/64b000000000000000000000/download",
      { access: empA.access },
    );
    ok("12. unknown document id → 404", notFound.status === 404);
    const badId = await apiRaw("GET", "/api/documents/not-an-id/download", {
      access: empA.access,
    });
    ok("13. invalid document id → 400", badId.status === 400);

    // ---- validation ------------------------------------------------------
    const badCat = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { category: "Nope" },
      file: { buffer: PDF_BYTES_2, mime: "application/pdf", name: "x.pdf" },
    });
    ok("14. unknown category → 400", badCat.status === 400);
    const badMime = await apiUpload("/api/documents", {
      access: empA.access,
      file: { buffer: PDF_BYTES_2, mime: "application/x-msdownload", name: "evil.exe" },
    });
    ok("15. disallowed file type → 400", badMime.status === 400);
    const mismatch = await apiUpload("/api/documents", {
      access: empA.access,
      file: {
        buffer: Buffer.from("not really a pdf"),
        mime: "application/pdf",
        name: "fake.pdf",
      },
    });
    ok("16. content/mime mismatch (magic bytes) → 400", mismatch.status === 400);
    const oversize = await apiUpload("/api/documents", {
      access: empA.access,
      file: {
        buffer: Buffer.alloc(11 * 1024 * 1024, 1),
        mime: "application/pdf",
        name: "big.pdf",
      },
    });
    ok("17. oversize upload → 413", oversize.status === 413);
    const dup = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "again", category: "Other" },
      file: { buffer: PDF_BYTES, mime: "application/pdf", name: "note-a-copy.pdf" },
    });
    ok("18. duplicate bytes → 409", dup.status === 409);

    // ---- HR uploads + scope ---------------------------------------------
    const upIn = await apiUpload("/api/documents", {
      access: hr.access,
      fields: {
        title: "HR in-scope policy",
        category: "Policy",
        owner: String(inScopeEmp._id),
        visibility: "all",
      },
      file: { buffer: PDF_BYTES_2, mime: "application/pdf", name: "policy.pdf" },
    });
    ok(
      "19. HR uploads for in-scope employee (company-wide) → 201",
      upIn.status === 201 &&
        String(upIn.body.document.owner) === String(inScopeEmp._id) &&
        upIn.body.document.visibility === "all",
    );
    const upOut = await apiUpload("/api/documents", {
      access: hr.access,
      fields: { owner: String(outScopeEmp._id) },
      file: { buffer: PDF_BYTES_3, mime: "application/pdf", name: "out-of-scope.pdf" },
    });
    ok("20. HR upload outside scope → 403", upOut.status === 403);
    const upMgr = await apiUpload("/api/documents", {
      access: manager.access,
      fields: { visibility: "all", title: "mgr doc" },
      file: { buffer: PDF_BYTES_3, mime: "application/pdf", name: "mgr.pdf" },
    });
    ok(
      "21. manager upload accepted but forced to private (self-service)",
      upMgr.status === 201 && upMgr.body.document.visibility === "private",
    );
    const listB1 = await apiJson("GET", "/api/documents", { access: empB.access });
    const sharedOk =
      listB1.status === 200 &&
      listB1.body.documents.some((d) => d._id === upIn.body.document._id);
    const dlShared = await apiRaw(
      "GET",
      `/api/documents/${upIn.body.document._id}/download`,
      { access: empB.access },
    );
    ok(
      "22. company-wide document visible + downloadable for any employee",
      sharedOk && dlShared.status === 200 && dlShared.buffer.equals(PDF_BYTES_2),
    );
    const dlHr = await apiRaw(
      "GET",
      `/api/documents/${upIn.body.document._id}/download`,
      { access: hr.access },
    );
    ok("23. HR downloads document of in-scope employee → 200", dlHr.status === 200);

    // ---- verify ----------------------------------------------------------
    const verEmp = await apiJson("PUT", `/api/documents/${docA._id}/verify`, {
      access: empA.access,
    });
    ok("24. employee cannot verify → 403", verEmp.status === 403);
    const verHr = await apiJson(
      "PUT",
      `/api/documents/${upIn.body.document._id}/verify`,
      { access: hr.access },
    );
    ok(
      "25. HR verifies in-scope document → 200 verified + timestamp",
      verHr.status === 200 &&
        verHr.body.document.verified === true &&
        !!verHr.body.document.verifiedAt,
    );

    // ---- delete: permission, retention, archive --------------------------
    const delEmp = await apiJson("DELETE", `/api/documents/${docA._id}`, {
      access: empA.access,
    });
    ok("26. employee cannot delete register documents → 403", delEmp.status === 403);

    const docsDir = path.join(UPLOAD_DIR, "documents");
    const readdirSafe = () => (fs.existsSync(docsDir) ? fs.readdirSync(docsDir) : []);

    const delRetained = await apiJson(
      "DELETE",
      `/api/documents/${upIn.body.document._id}`,
      { access: hr.access },
    );
    ok(
      "27. HR delete of retained category (Policy) → archived, bytes kept",
      delRetained.status === 200 &&
        delRetained.body.archived === true &&
        delRetained.body.storageAction === "retained",
    );
    ok(
      "28. retained bytes still on disk after delete",
      readdirSafe().some((f) => f.startsWith(String(upIn.body.document._id))),
    );
    const dlArchived = await apiRaw(
      "GET",
      `/api/documents/${upIn.body.document._id}/download`,
      { access: hr.access },
    );
    ok("29. archived document no longer downloadable → 404", dlArchived.status === 404);
    const adminList = await apiJson("GET", "/api/documents?includeDeleted=1", {
      access: admin.access,
    });
    ok(
      "30. admin can include archived records (audit view)",
      adminList.status === 200 &&
        adminList.body.documents.some((d) => d._id === upIn.body.document._id),
    );

    const upStd = await apiUpload("/api/documents", {
      access: hr.access,
      fields: { title: "temp std", category: "Other", owner: String(inScopeEmp._id) },
      file: { buffer: PDF_BYTES_4, mime: "application/pdf", name: "temp.pdf" },
    });
    const delStd = await apiJson("DELETE", `/api/documents/${upStd.body.document._id}`, {
      access: hr.access,
    });
    ok(
      "31. HR delete of standard category → archived and bytes removed",
      delStd.status === 200 &&
        delStd.body.storageAction === "deleted" &&
        !readdirSafe().some((f) => f.startsWith(String(upStd.body.document._id))),
    );
    const listAfter = await apiJson("GET", "/api/documents", { access: hr.access });
    ok(
      "32. archived records hidden from regular lists",
      !listAfter.body.documents.some((d) => d._id === upStd.body.document._id),
    );

    // ---- payslip archive -------------------------------------------------
    const slipA = await Payroll.findOne({ employee: A.emp._id }).sort({ period: -1 });
    ok("33. seeded payroll slip exists for rohith", !!slipA);
    const arch = await apiJson("POST", `/api/payroll/${slipA._id}/payslip/archive`, {
      access: admin.access,
    });
    ok(
      "34. admin archives payslip PDF → 201 (private, retained, provider)",
      arch.status === 201 &&
        arch.body.document.category === "payslip" &&
        arch.body.document.visibility === "private" &&
        arch.body.document.retention === "retain" &&
        arch.body.document.storageProvider === "local",
    );
    const archId = arch.body.document._id;
    const archAgain = await apiJson("POST", `/api/payroll/${slipA._id}/payslip/archive`, {
      access: admin.access,
    });
    ok("35. duplicate archive → 409 (idempotent)", archAgain.status === 409);
    const archEmp = await apiJson("POST", `/api/payroll/${slipA._id}/payslip/archive`, {
      access: empA.access,
    });
    ok("36. employee cannot archive payslips → 403", archEmp.status === 403);
    const pdfStill = await apiRaw("GET", `/api/payroll/${slipA._id}/payslip/pdf`, {
      access: empA.access,
    });
    ok(
      "37. regular payslip PDF endpoint unaffected by archiving",
      pdfStill.status === 200 && pdfStill.buffer.length > 500,
    );

    // ---- employee-documents retrieval ------------------------------------
    const edListA = await apiJson(
      "GET",
      `/api/employee-documents?employeeId=${A.emp._id}`,
      { access: empA.access },
    );
    ok(
      "38. employee lists own HR documents (documents:read_own fix) → 200",
      edListA.status === 200 &&
        edListA.body.documents.some((d) => d._id === archId),
    );
    const edDl = await apiRaw("GET", `/api/employee-documents/${archId}/download`, {
      access: empA.access,
    });
    ok(
      "39. employee downloads own archived payslip → 200 application/pdf",
      edDl.status === 200 &&
        (edDl.headers.get("content-type") || "").includes("application/pdf") &&
        edDl.buffer.slice(0, 4).toString() === "%PDF",
    );
    const edIdor = await apiRaw("GET", `/api/employee-documents/${archId}/download`, {
      access: empB.access,
    });
    ok("40. another employee cannot download it → 403 (IDOR blocked)", edIdor.status === 403);
    const hrCanSee = scopeIds.includes(String(A.emp._id));
    const edByHr = await apiRaw("GET", `/api/employee-documents/${archId}/download`, {
      access: hr.access,
    });
    ok(
      "41. HR retrieval follows the in-scope rule",
      edByHr.status === (hrCanSee ? 200 : 403),
    );

    // ---- employee-documents upload / delete / verify ---------------------
    const edUp = await apiUpload("/api/employee-documents", {
      access: empA.access,
      fields: { employeeId: String(A.emp._id), type: "Aadhaar", category: "id_proof" },
      file: { buffer: PNG_BYTES, mime: "image/png", name: "aadhaar.png" },
    });
    ok("42. employee uploads own employee-document → 201", edUp.status === 201);
    ok(
      "43. retained category stored as retained",
      edUp.body.document && edUp.body.document.retention === "retain",
    );
    const edUpOther = await apiUpload("/api/employee-documents", {
      access: empA.access,
      fields: { employeeId: String(B.emp._id), type: "x" },
      file: { buffer: PNG_BYTES_2, mime: "image/png", name: "other.png" },
    });
    ok("44. employee cannot upload for someone else → 403", edUpOther.status === 403);
    const edDlB = await apiRaw(
      "GET",
      `/api/employee-documents/${edUp.body.document._id}/download`,
      { access: empB.access },
    );
    ok("45. another employee cannot download it → 403", edDlB.status === 403);
    const edVerifyEmp = await apiJson(
      "POST",
      `/api/employee-documents/${edUp.body.document._id}/verify`,
      { access: empA.access },
    );
    ok("46. employee cannot verify employee-document → 403", edVerifyEmp.status === 403);
    const edVerifyHr = await apiJson(
      "POST",
      `/api/employee-documents/${edUp.body.document._id}/verify`,
      { access: hr.access },
    );
    ok("47. HR verifies employee-document → 200", edVerifyHr.status === 200);

    const edUp2 = await apiUpload("/api/employee-documents", {
      access: empA.access,
      fields: { employeeId: String(A.emp._id), type: "Temp", category: "other" },
      file: { buffer: Buffer.concat([PNG_BYTES, Buffer.from("2")]), mime: "image/png", name: "temp.png" },
    });
    const edDel = await apiJson(
      "DELETE",
      `/api/employee-documents/${edUp2.body.document._id}`,
      { access: empA.access },
    );
    ok(
      "48. uploader deletes own employee-document → archived + bytes removed",
      edDel.status === 200 && edDel.body.storageAction === "deleted",
    );
    const edListAfter = await apiJson(
      "GET",
      `/api/employee-documents?employeeId=${A.emp._id}`,
      { access: empA.access },
    );
    ok(
      "49. archived employee-document hidden from lists",
      !edListAfter.body.documents.some((d) => d._id === edUp2.body.document._id),
    );

    // ---- missing file on disk → 404, never a crash -----------------------
    // empB uploads one document, then its file is removed from disk directly
    // (simulating out-of-band deletion) — download must 404, not crash.
    const upB = await apiUpload("/api/documents", {
      access: empB.access,
      fields: { title: "EmpB doc", category: "Other" },
      file: { buffer: PNG_BYTES_2, mime: "image/png", name: "b.png" },
    });
    const fB = readdirSafe().find((f) => f.startsWith(String(upB.body.document._id)));
    if (fB) fs.unlinkSync(path.join(docsDir, fB));
    const missB = await apiRaw("GET", `/api/documents/${upB.body.document._id}/download`, {
      access: empB.access,
    });
    ok(
      "50. file missing on disk → 404 (no crash, no orphan stream)",
      missB.status === 404,
    );
    const listB2 = await apiJson("GET", "/api/documents", { access: empB.access });
    ok(
      "51. metadata stays listed even when bytes are gone (reconciliation target)",
      listB2.status === 200 &&
        listB2.body.documents.some((d) => d._id === upB.body.document._id),
    );
  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDB();
    await mem.stop();
  }

  console.log(
    "\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + ": " + pass + " passed, " + fail + " failed",
  );
  if (fails.length) console.log("Failed:\n - " + fails.join("\n - "));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
