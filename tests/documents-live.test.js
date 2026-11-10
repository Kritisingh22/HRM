/* Documents module — LIVE Google Drive acceptance suite.
 *
 *   GOOGLE_DRIVE_LIVE=1 node tests/documents-live.test.js
 *
 * Runs the REAL pipeline (Express app + memory MongoDB + the REAL googleapis
 * Drive client) against a DEDICATED test area:
 *   - GOOGLE_DRIVE_TEST_FOLDER_ID when set, otherwise a `hrm-live-tests`
 *     subfolder is created inside GOOGLE_DRIVE_FOLDER_ID and used for
 *     everything this suite uploads (the configured folder itself is only
 *     listed/entered — never written to directly by this suite).
 *
 * Exit codes: 0 = all pass, 1 = failures, 2 = skipped (gate closed or Drive
 * not configured). Run `npm run check:storage -- --roundtrip` first to
 * validate credentials + folder access before this suite.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";
process.env.DOCUMENT_STORAGE = "google-drive";
process.env.UPLOAD_RATE_MAX = "1000";
process.env.UPLOAD_MAX_MB = "25";

if (process.env.GOOGLE_DRIVE_LIVE !== "1") {
  console.log("SKIPPED — documents-live needs a live Google Drive. Set:");
  console.log("  GOOGLE_DRIVE_LIVE=1");
  console.log("  GOOGLE_DRIVE_FOLDER_ID=<folder id shared with the service account as Editor>");
  console.log("  GOOGLE_DRIVE_AUTH_MODE=service_account + GOOGLE_SERVICE_ACCOUNT_FILE=<path to key json>");
  console.log("  (or the GOOGLE_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REFRESH_TOKEN trio)");
  console.log("  GOOGLE_DRIVE_TEST_FOLDER_ID=<optional dedicated test subfolder id>");
  console.log("Validate first: npm run check:storage -- --roundtrip");
  process.exit(2);
}

const crypto = require("crypto");
const { MongoMemoryServer } = require("mongodb-memory-server");
const cfg = require("../config/env");
const gd = require("../services/googleDrive");

const FOLDER_MIME = "application/vnd.google-apps.folder";
const LIVE_FOLDER_NAME = "hrm-live-tests";

let pass = 0;
let fail = 0;
const fails = [];
const created = []; // Drive file ids created by this suite (cleaned up in finally)
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
  }
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const PORT = 5095;
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
  return { status: res.status, body: data };
}

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

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

(async () => {
  if (!gd.isConfigured()) {
    console.log("SKIPPED — Google Drive is not configured: " + gd.configurationHint());
    process.exit(2);
  }

  // ---- pick the dedicated test area (never write into the root folder) ----
  let workingFolder;
  let createdFolder = false;
  if (cfg.GOOGLE_DRIVE_TEST_FOLDER_ID) {
    workingFolder = await gd.getFolder(cfg.GOOGLE_DRIVE_TEST_FOLDER_ID);
    console.log(`Live test area: ${workingFolder.name} (${workingFolder.id}) — GOOGLE_DRIVE_TEST_FOLDER_ID`);
  } else {
    const children = await gd.listChildren(cfg.GOOGLE_DRIVE_FOLDER_ID);
    workingFolder = children.find((f) => f.mimeType === FOLDER_MIME && f.name === LIVE_FOLDER_NAME);
    if (!workingFolder) {
      workingFolder = await gd.ensureFolder(cfg.GOOGLE_DRIVE_FOLDER_ID, LIVE_FOLDER_NAME);
      createdFolder = true;
    }
    console.log(`Live test area: ${workingFolder.name} (${workingFolder.id}) — inside the configured folder`);
  }
  // Everything from here on targets the test area.
  cfg.GOOGLE_DRIVE_FOLDER_ID = workingFolder.id;

  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const Employee = require("../models/Employee");
  const User = require("../models/User");
  const Document = require("../models/Document");
  const Payroll = require("../models/Payroll");

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const empB = await login("athul.raja@cyethack.com", "AthuCY0226AR110");
    const admin = await login("admin@cyethack.com", "Admin@123");
    ok("L0. logins work", [empA, empB, admin].every((l) => l.status === 200 && l.access));

    const userA = await User.findOne({ email: "rohith.sai@cyethack.com" });
    const empARec = await Employee.findOne({ user: userA._id });
    ok("L0b. employee record resolvable", !!empARec);

    const pdfBytes = Buffer.from(`%PDF-1.4\nlive-acceptance ${Date.now()}\n%%EOF\n`);

    // ---- L1-L4: real upload / download / IDOR / duplicate -----------------
    const up = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "Live Drive doc", category: "Other" },
      file: { buffer: pdfBytes, mime: "application/pdf", name: "live-1.pdf" },
    });
    ok(
      "L1. real Drive upload → 201, provider google-drive",
      up.status === 201 && up.body.document.storageProvider === "google-drive",
    );
    const docId = up.body.document._id;
    const rec = await Document.findById(docId).select("driveFileId checksum");
    created.push(rec.driveFileId);
    const meta = await gd.getFileMeta(rec.driveFileId);
    ok(
      "L1b. Drive file exists in the test area with the record's checksum",
      !!meta &&
        !meta.trashed &&
        rec.checksum === sha(pdfBytes) &&
        (meta.parents || []).includes(workingFolder.id),
    );
    const dl = await apiRaw("GET", `/api/documents/${docId}/download`, { access: empA.access });
    ok(
      "L2. real download → 200, exact bytes (sha256 match)",
      dl.status === 200 && sha(dl.buffer) === sha(pdfBytes),
    );
    const idor = await apiRaw("GET", `/api/documents/${docId}/download`, { access: empB.access });
    ok("L3. cross-employee IDOR → 403 (real Drive path)", idor.status === 403);
    const dup = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "dup", category: "Other" },
      file: { buffer: pdfBytes, mime: "application/pdf", name: "live-1-copy.pdf" },
    });
    ok("L4. duplicate bytes → 409 (no second Drive upload)", dup.status === 409);

    // ---- L5: resumable (>threshold) upload round-trip ---------------------
    const big = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      crypto.randomBytes(Math.max(1, cfg.UPLOAD_RESUMABLE_THRESHOLD_MB) * 1024 * 1024 + 1024 * 512),
      Buffer.from("\n%%EOF\n"),
    ]);
    const upBig = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "Large doc (resumable)", category: "Other" },
      file: { buffer: big, mime: "application/pdf", name: "live-large.pdf" },
    });
    ok("L5. large (>resumable threshold) upload → 201", upBig.status === 201);
    if (upBig.status === 201) {
      const bigRec = await Document.findById(upBig.body.document._id).select("driveFileId");
      created.push(bigRec.driveFileId);
      const dlBig = await apiRaw("GET", `/api/documents/${upBig.body.document._id}/download`, {
        access: empA.access,
      });
      ok(
        "L5b. large download → exact bytes (resumable path verified)",
        dlBig.status === 200 && sha(dlBig.buffer) === sha(big) && dlBig.buffer.length === big.length,
      );
    }

    // ---- L6: file removed on Drive out-of-band ---------------------------
    await gd.deleteFile(rec.driveFileId);
    const gone = await apiRaw("GET", `/api/documents/${docId}/download`, { access: empA.access });
    const goneRec = await Document.findById(docId).select("uploadStatus");
    ok(
      "L6. removed Drive file → 404 + record flagged 'missing'",
      gone.status === 404 && goneRec.uploadStatus === "missing",
    );

    // ---- L7-L8: delete → trash vs retain (verified on Drive) -------------
    const upStd = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "std", category: "Other" },
      file: { buffer: Buffer.from(`%PDF-1.4\nstd ${Date.now()}\n%%EOF\n`), mime: "application/pdf", name: "live-std.pdf" },
    });
    const stdRec = await Document.findById(upStd.body.document._id).select("driveFileId");
    created.push(stdRec.driveFileId);
    const delStd = await apiJson("DELETE", `/api/documents/${upStd.body.document._id}`, {
      access: admin.access,
    });
    const stdMeta = await gd.getFileMeta(stdRec.driveFileId);
    ok(
      "L7. delete (standard) → trashed on Drive, metadata archived",
      delStd.status === 200 && delStd.body.storageAction === "trashed" && stdMeta && stdMeta.trashed === true,
    );

    const upRet = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "policy", category: "Policy" },
      file: { buffer: Buffer.from(`%PDF-1.4\nretain ${Date.now()}\n%%EOF\n`), mime: "application/pdf", name: "live-retain.pdf" },
    });
    const retRec = await Document.findById(upRet.body.document._id).select("driveFileId");
    created.push(retRec.driveFileId);
    const delRet = await apiJson("DELETE", `/api/documents/${upRet.body.document._id}`, {
      access: admin.access,
    });
    const retMeta = await gd.getFileMeta(retRec.driveFileId);
    ok(
      "L8. delete (retained) → archived, Drive file kept (not trashed)",
      delRet.status === 200 && delRet.body.storageAction === "retained" && retMeta && retMeta.trashed === false,
    );

    // ---- L9: payslip archive into real Drive -----------------------------
    const slip = await Payroll.findOne({ employee: empARec._id }).sort({ period: -1 });
    ok("L9. seeded payroll slip exists", !!slip);
    const arch = await apiJson("POST", `/api/payroll/${slip._id}/payslip/archive`, {
      access: admin.access,
    });
    ok("L9b. payslip archived to real Drive → 201", arch.status === 201 && arch.body.document.category === "payslip");
    if (arch.status === 201) {
      const archRec = await require("../models/EmployeeDocument")
        .findById(arch.body.document._id)
        .select("driveFileId");
      created.push(archRec.driveFileId);
      const archMeta = await gd.getFileMeta(archRec.driveFileId);
      const archDl = await apiRaw("GET", `/api/employee-documents/${arch.body.document._id}/download`, {
        access: empA.access,
      });
      ok(
        "L9c. archived payslip: on Drive + employee downloads real PDF",
        !!archMeta &&
          archMeta.trashed === false &&
          archDl.status === 200 &&
          archDl.buffer.slice(0, 4).toString() === "%PDF",
      );
      const archAgain = await apiJson("POST", `/api/payroll/${slip._id}/payslip/archive`, {
        access: admin.access,
      });
      ok("L9d. duplicate archive → 409", archAgain.status === 409);
    }

    // ---- L10: reconciliation against the live folder ---------------------
    const { reconcileOnce } = require("../scripts/reconcile-storage");
    const report = await reconcileOnce({
      drive: gd,
      specs: [
        { name: "Document", model: Document, keyField: "storageKey", statusField: "uploadStatus" },
        { name: "Certification", model: require("../models/Certification"), keyField: "certificateFileKey", statusField: null },
      ],
      log: () => {},
    });
    ok(
      "L10. reconciliation runs live; none of our files reported as orphaned",
      !report.orphans.some((f) => created.includes(f.id)),
    );
  } finally {
    // ---- cleanup: hard-delete only files THIS suite created --------------
    let cleaned = 0;
    const uncleaned = [];
    for (const id of created) {
      try {
        await gd.deleteFile(id);
        cleaned++;
      } catch (e) {
        // A hard-delete can 404 when the file was already removed by the
        // suite itself (e.g. the L6 out-of-band deletion) — that is cleaned.
        const still = await gd.getFileMeta(id).catch(() => null);
        if (!still || still.trashed) cleaned++;
        else uncleaned.push(`${id} (${e.message})`);
      }
    }
    if (createdFolder) {
      try {
        await gd.deleteFile(workingFolder.id); // only when we created it and it should be empty now
      } catch {
        /* leave the folder if anything remains — harmless */
      }
    }
    console.log(`Cleanup: ${cleaned}/${created.length} test files deleted from the test area.`);
    if (uncleaned.length) console.log("  still present:\n  - " + uncleaned.join("\n  - "));

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
