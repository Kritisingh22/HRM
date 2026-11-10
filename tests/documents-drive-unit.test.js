/* Google Drive storage — unit suite with a FAKE Drive adapter.
 *
 *   node tests/documents-drive-unit.test.js
 *
 * This is NOT acceptance evidence for live Drive behavior — it exercises OUR
 * orchestration only (provider seam, orphan compensation, trash vs retain,
 * missing-file flags, reconciliation, retry/error mapping) with a scripted
 * fake standing in for the Drive API. Live Drive is covered by
 * tests/documents-live.test.js (GOOGLE_DRIVE_LIVE=1 + real credentials).
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "50";
process.env.DOCUMENT_STORAGE = "google-drive"; // exercised via the fake adapter below
process.env.UPLOAD_RATE_MAX = "1000";

const { Readable } = require("stream");
const { MongoMemoryServer } = require("mongodb-memory-server");
const ApiError = require("../utils/ApiError");

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

const PORT = 5096;
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

/* ---------------- fake Drive adapter ---------------- */

function makeFakeDrive() {
  const state = {
    files: new Map(),
    calls: [],
    failNextUpload: null,
    failNextTrash: null,
  };
  let seq = 0;
  return {
    state,
    isConfigured: () => true,
    uploadFile: async ({ name, buffer, mimeType, parentId, appProperties }) => {
      state.calls.push({ op: "upload", name, parentId, appProperties, size: buffer.length });
      if (state.failNextUpload) {
        const e = state.failNextUpload;
        state.failNextUpload = null;
        throw e;
      }
      const id = "fake-" + ++seq;
      state.files.set(id, {
        id,
        name,
        buffer,
        mimeType,
        parentId,
        appProperties: appProperties || {},
        trashed: false,
      });
      return { id, name, size: buffer.length, mimeType };
    },
    getFileStream: async (id) => {
      const f = state.files.get(id);
      if (!f || f.trashed) throw new ApiError(404, "The file was not found in storage.");
      state.calls.push({ op: "download", id });
      return Readable.from([f.buffer]);
    },
    getFileMeta: async (id) => {
      const f = state.files.get(id);
      if (!f) return null;
      return {
        id,
        name: f.name,
        mimeType: f.mimeType,
        trashed: f.trashed,
        size: f.buffer.length,
        appProperties: f.appProperties,
      };
    },
    fileExists: async (id) => {
      const f = state.files.get(id);
      return !!f && !f.trashed;
    },
    trashFile: async (id) => {
      state.calls.push({ op: "trash", id });
      if (state.failNextTrash) {
        const e = state.failNextTrash;
        state.failNextTrash = null;
        throw e;
      }
      const f = state.files.get(id);
      if (!f) throw new ApiError(404, "The file was not found in storage.");
      f.trashed = true;
      return { id, trashed: true };
    },
    deleteFile: async (id) => {
      state.files.delete(id);
      return { id, deleted: true };
    },
    listChildren: async (parentId) =>
      [...state.files.values()]
        .filter((f) => !f.trashed && f.parentId === parentId)
        .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, appProperties: f.appProperties })),
    getFolder: async (id) => ({ id, name: "fake-root", mimeType: "application/vnd.google-apps.folder" }),
    ensureFolder: async (parentId, name) => ({
      id: "fake-folder-1",
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
  };
}

const pdf = (tag) => Buffer.from(`%PDF-1.4\n${tag}\n%%EOF\n`);

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase } = require("../seeds/seed");
  await seedDatabase();

  const cfg = require("../config/env");
  const storage = require("../services/storage");
  const DocumentModel = require("../models/Document");

  cfg.GOOGLE_DRIVE_FOLDER_ID = "fake-root-folder";
  const fake = makeFakeDrive();
  storage.__test.setDriveAdapter(fake);

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    const empA = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    const empB = await login("athul.raja@cyethack.com", "AthuCY0226AR110");
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok("D0. logins work (employee x2, HR)", [empA, empB, hr].every((l) => l.status === 200 && l.access));

    // ---- D1-D4: upload routed through the Drive seam ----------------------
    const up = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "Drive doc", category: "Other" },
      file: { buffer: pdf("drive-unit-1"), mime: "application/pdf", name: "drive-1.pdf" },
    });
    ok(
      "D1. upload routed through the Drive adapter → 201, provider recorded",
      up.status === 201 && up.body.document.storageProvider === "google-drive",
    );
    const docId = up.body.document._id;
    const dbDoc = await DocumentModel.findById(docId);
    ok(
      "D2. Drive file id persisted in MongoDB (internal only)",
      !!(dbDoc && dbDoc.driveFileId && dbDoc.driveFileId.startsWith("fake-")),
    );
    ok(
      "D3. response strips Drive internals (no file id / key / checksum)",
      up.body.document.driveFileId === undefined &&
        up.body.document.storageKey === undefined &&
        up.body.document.checksum === undefined,
    );
    const upCall = fake.state.calls.filter((c) => c.op === "upload").pop();
    ok(
      "D4. app-managed marker + record linkage + target folder",
      upCall.appProperties.managedBy === "cyethack-hrm" &&
        upCall.appProperties.documentId === docId &&
        upCall.parentId === "fake-root-folder",
    );

    // ---- D5-D6: download + duplicate through the seam ---------------------
    const dl = await apiRaw("GET", `/api/documents/${docId}/download`, { access: empA.access });
    ok(
      "D5. download streams through the adapter (bytes intact)",
      dl.status === 200 && dl.buffer.equals(pdf("drive-unit-1")),
    );
    const dup = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "dup", category: "Other" },
      file: { buffer: pdf("drive-unit-1"), mime: "application/pdf", name: "drive-1-copy.pdf" },
    });
    ok("D6. duplicate bytes → 409 (Drive upload avoided)", dup.status === 409);

    // ---- D7: externally removed Drive file -------------------------------
    const dlPrimary = await DocumentModel.findById(docId).select("driveFileId");
    fake.state.files.delete(dlPrimary.driveFileId);
    const dlGone = await apiRaw("GET", `/api/documents/${docId}/download`, { access: empA.access });
    const afterGone = await DocumentModel.findById(docId).select("uploadStatus");
    ok(
      "D7. removed Drive file → 404 + record flagged 'missing' (reconciliation target)",
      dlGone.status === 404 && afterGone.uploadStatus === "missing",
    );

    // ---- D8-D9: delete → trash (standard) vs retain ----------------------
    const upStd = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "std", category: "Other" },
      file: { buffer: pdf("drive-unit-std"), mime: "application/pdf", name: "std.pdf" },
    });
    const stdRec = await DocumentModel.findById(upStd.body.document._id).select("driveFileId");
    const delStd = await apiJson("DELETE", `/api/documents/${upStd.body.document._id}`, {
      access: hr.access,
    });
    const stdTrashed =
      fake.state.files.get(stdRec.driveFileId) && fake.state.files.get(stdRec.driveFileId).trashed === true;
    ok(
      "D8. delete (standard category) → archived + Drive file trashed (recoverable)",
      delStd.status === 200 && delStd.body.storageAction === "trashed" && stdTrashed,
    );

    const upRet = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "policy", category: "Policy" },
      file: { buffer: pdf("drive-unit-retain"), mime: "application/pdf", name: "retain.pdf" },
    });
    const retRec = await DocumentModel.findById(upRet.body.document._id).select("driveFileId");
    const trashCallsBefore = fake.state.calls.filter((c) => c.op === "trash").length;
    const delRet = await apiJson("DELETE", `/api/documents/${upRet.body.document._id}`, {
      access: hr.access,
    });
    const trashCallsAfter = fake.state.calls.filter((c) => c.op === "trash").length;
    const retFile = fake.state.files.get(retRec.driveFileId);
    ok(
      "D9. delete (retained category) → archived, Drive file KEPT",
      delRet.status === 200 &&
        delRet.body.storageAction === "retained" &&
        trashCallsAfter === trashCallsBefore &&
        retFile &&
        retFile.trashed === false,
    );

    // ---- D10: Drive refusal surfaces safely ------------------------------
    fake.state.failNextUpload = new ApiError(502, "Document storage refused the request.");
    const countBefore = await DocumentModel.countDocuments({});
    const refuse = await apiUpload("/api/documents", {
      access: empA.access,
      fields: { title: "refused", category: "Other" },
      file: { buffer: pdf("drive-unit-refuse"), mime: "application/pdf", name: "refuse.pdf" },
    });
    ok(
      "D10. Drive refusal → 502, no MongoDB record written",
      refuse.status === 502 && (await DocumentModel.countDocuments({})) === countBefore,
    );

    // ---- D11: MongoDB write failure AFTER Drive upload → orphan cleanup ---
    const idsBefore = new Set(fake.state.files.keys());
    const origCreate = DocumentModel.create;
    DocumentModel.create = async () => {
      throw new Error("simulated mongo failure");
    };
    let orphanUploadId = null;
    try {
      const before = await DocumentModel.countDocuments({});
      const res = await apiUpload("/api/documents", {
        access: empA.access,
        fields: { title: "orphan", category: "Other" },
        file: { buffer: pdf("drive-unit-orphan"), mime: "application/pdf", name: "orphan.pdf" },
      });
      orphanUploadId = [...fake.state.files.keys()].find((id) => !idsBefore.has(id));
      const after = await DocumentModel.countDocuments({});
      ok(
        "D11. Mongo failure after Drive upload → compensated (Drive file trashed, no record)",
        res.status === 500 &&
          !!orphanUploadId &&
          fake.state.files.get(orphanUploadId).trashed === true &&
          after === before,
      );
    } finally {
      DocumentModel.create = origCreate;
    }

    // ---- D12: compensation failure is logged, never masks the error ------
    const idsBefore2 = new Set(fake.state.files.keys());
    fake.state.failNextTrash = new Error("trash boom");
    DocumentModel.create = async () => {
      throw new Error("simulated mongo failure");
    };
    try {
      const res = await apiUpload("/api/documents", {
        access: empA.access,
        fields: { title: "orphan2", category: "Other" },
        file: { buffer: pdf("drive-unit-orphan2"), mime: "application/pdf", name: "orphan2.pdf" },
      });
      const newId = [...fake.state.files.keys()].find((id) => !idsBefore2.has(id));
      const trashAttempted = fake.state.calls.some((c) => c.op === "trash" && c.id === newId);
      ok(
        "D12. cleanup-trashed failure still → 500 (attempted compensation, logged, no false success)",
        res.status === 500 && trashAttempted,
      );
    } finally {
      DocumentModel.create = origCreate;
    }

    // ---- D13: reconciliation (ghosts + orphans) --------------------------
    const { reconcileOnce } = require("../scripts/reconcile-storage");
    const silent = () => {};

    fake.state.files.set("fake-orphan-1", {
      id: "fake-orphan-1",
      name: "orphan.pdf",
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
      parentId: "fake-root-folder",
      appProperties: { managedBy: "cyethack-hrm" },
      trashed: false,
    });
    fake.state.files.set("fake-unmarked", {
      id: "fake-unmarked",
      name: "someone-elses.pdf",
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
      parentId: "fake-root-folder",
      appProperties: { managedBy: "not-our-app" },
      trashed: false,
    });
    const ghostDoc = await DocumentModel.create({
      title: "ghost",
      category: "Other",
      visibility: "private",
      storageKey: "ghost-999",
      storageProvider: "google-drive",
      driveFileId: "ghost-999",
      originalName: "ghost.pdf",
      mimeType: "application/pdf",
      size: 1,
      uploadStatus: "active",
    });

    const specs = [
      { name: "Document", model: DocumentModel, keyField: "storageKey", statusField: "uploadStatus" },
    ];
    const report = await reconcileOnce({ drive: fake, specs, log: silent });
    ok(
      "D13a. reconciliation finds the ghost (record without a Drive file)",
      report.ghosts.some((g) => g.label === `Document/${String(ghostDoc._id)}`),
    );
    ok(
      "D13b. orphans = app-marked files only (foreign files untouched)",
      report.orphans.some((f) => f.id === "fake-orphan-1") &&
        !report.orphans.some((f) => f.id === "fake-unmarked"),
    );

    const fixedReport = await reconcileOnce({
      drive: fake,
      specs,
      fixMissing: true,
      trashOrphans: true,
      confirmTrash: true,
      log: silent,
    });
    const ghostAfter = await DocumentModel.findById(ghostDoc._id).select("uploadStatus");
    ok(
      "D13c. --fix-missing flags the record + --trash-orphans trashes the orphan",
      ghostAfter.uploadStatus === "missing" &&
        fixedReport.trashed >= 1 &&
        fake.state.files.get("fake-orphan-1").trashed === true &&
        fake.state.files.get("fake-unmarked").trashed === false,
    );

    // ---- D14: retry / error mapping primitives ---------------------------
    const gd = require("../services/googleDrive");
    const { withRetry, mapDriveError } = gd.__test;
    ok(
      "D14a. error mapping: 404→404, 429→503, 403→502, quota→507, ApiError passthrough",
      mapDriveError({ response: { status: 404 } }).statusCode === 404 &&
        mapDriveError({ response: { status: 429 } }).statusCode === 503 &&
        mapDriveError({ response: { status: 403 } }).statusCode === 502 &&
        mapDriveError({ errors: [{ reason: "storageQuotaExceeded" }] }).statusCode === 507 &&
        mapDriveError(new ApiError(404, "x")).statusCode === 404,
    );

    let attempts429 = 0;
    const retried = await withRetry(async () => {
      attempts429++;
      if (attempts429 < 3) {
        const e = new Error("rate limited");
        e.code = 429;
        throw e;
      }
      return "ok";
    }, "unit-test");
    ok(
      "D14b. transient (429) failures retried with backoff then succeed",
      retried === "ok" && attempts429 === 3,
    );

    let attemptsHard = 0;
    let hardErr = null;
    try {
      await withRetry(async () => {
        attemptsHard++;
        const e = new Error("no auth");
        e.response = { status: 401 };
        throw e;
      }, "unit-test");
    } catch (e) {
      hardErr = e;
    }
    ok(
      "D14c. hard failure (401) NOT retried, surfaced as safe 502",
      attemptsHard === 1 && hardErr && hardErr.statusCode === 502,
    );
  } finally {
    storage.__test.resetDriveAdapter();
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
