/* Documents API — the single document register (Document model, merged from the
 * old Document + EmployeeDocument models). Bytes live in the configured object
 * storage provider (local disk / Google Drive / Cloudflare R2); MongoDB keeps
 * metadata + the file key only.
 *
 *  - Admin / Super Admin: all documents.
 *  - HR: shared ('all') documents + documents of employees within their scope
 *    (assigned employees + live access-request grants).
 *  - Everyone else: shared ('all') documents plus their own (owner or subject).
 * Uploads are forced to self + private unless the caller has documents:write
 * (HR scopes the owner to their employees; admin may file for any employee or
 * company-wide). Bytes are streamed through this controller after
 * authorisation — raw paths, Drive IDs, R2 keys and credentials are never exposed.
 * Deleting archives the record; retained categories keep their stored bytes.
 * Download by public reference: GET /api/documents/reference/:referenceId/download
 */
const crypto = require("crypto");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const Employee = require("../models/Employee");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { logAudit } = require("../utils/audit");
const { userHasPermission } = require("../utils/permissions");
const { putObject, getObjectStream, removeObject } = require("../services/storage");
const { bytesMatchDeclared } = require("../middleware/upload");
const { contentDisposition } = require("../utils/contentDisposition");
const { teamEmployeeIds } = require("../utils/teamScope");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];
const CATEGORIES = Document.schema.path("category").enumValues;
const VISIBILITIES = ["private", "hr", "all"];
const VIEWABLE = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/gif", "text/plain"];
// Payroll / HR records that must be retained: delete archives the metadata but
// keeps the stored bytes (soft-delete instead of permanent removal).
const RETAIN_CATEGORIES = new Set(["Payslip", "payslip", "Contract", "ID Proof", "id_proof", "HR Manual", "hr_manual", "Policy", "policy", "Circular Document", "Company Document"]);

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}
// True if `employeeId` (an Employee _id) is within the caller's team scope
// (assigned employees, also picking up live approved access-request grants).
async function ownerInScope(user, employeeObjectId) {
  if (!employeeObjectId) return false;
  const ids = await teamEmployeeIds(user);
  return ids.some((id) => String(id) === String(employeeObjectId));
}

// Object-level access check for a single document, shared by download routes.
function idOf(v) {
  if (v == null) return v;
  if (typeof v === 'object' && v._id) return String(v._id);
  return String(v);
}

async function canAccessDocument(user, doc) {
  if (!doc) return false;
  if (SEES_ALL.includes(user.role)) return true;
  if (doc.uploadedBy && idOf(doc.uploadedBy) === idOf(user._id)) return true;

  const me = await myEmployee(user);
  const isSubject = doc.employee && me && idOf(doc.employee) === idOf(me._id);
  const isOwner = doc.owner && me && idOf(doc.owner) === idOf(me._id);
  if (isSubject || isOwner) return true;
  if (doc.visibility === "all") return true;

  if (user.role === "HR") {
    if (doc.visibility === "hr") return true;
    if ((doc.owner && (await ownerInScope(user, doc.owner))) || (doc.employee && (await ownerInScope(user, doc.employee)))) {
      return true;
    }
  }
  return false;
}

function slugName(name) {
  return (
    String(name || "document")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "document"
  );
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function streamDocument(res, doc) {
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  if (doc.size) res.setHeader("Content-Length", String(doc.size));
  res.setHeader("Content-Disposition", contentDisposition(doc.originalName, true));
}

exports.list = catchAsync(async (req, res) => {
  // Check permission
  if (
    !userHasPermission(req.user, "documents:read") &&
    !userHasPermission(req.user, "documents:read_own")
  ) {
    throw ApiError.forbidden("You do not have permission to view documents.");
  }

  let filter = {};
  if (
    SEES_ALL.includes(req.user.role) &&
    userHasPermission(req.user, "documents:read")
  ) {
    // Admin/Super Admin with permission: see all (filter stays empty)
  } else if (req.user.role === "HR") {
    const allowed = await teamEmployeeIds(req.user);
    filter = {
      $or: [
        { visibility: "all" },
        { owner: { $in: allowed } },
        { employee: { $in: allowed } },
      ],
    };
  } else if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const or = [{ visibility: "all" }];
    if (me) {
      or.push({ owner: me._id }, { employee: me._id });
    }
    filter = { $or: or };
  } else {
    // HR without documents:read permission - see only public + own
    const me = await myEmployee(req.user);
    const or = [{ visibility: "all" }];
    if (me) or.push({ owner: me._id }, { employee: me._id });
    filter = { $or: or };
  }

  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 100)), "i");
    filter.$and = [{ $or: [{ title: rx }, { originalName: rx }] }];
  }
  // Archived (soft-deleted) records stay hidden unless an admin asks for them.
  const includeDeleted = req.query.includeDeleted === "1" && SEES_ALL.includes(req.user.role);
  if (!includeDeleted) filter.uploadStatus = { $ne: "deleted" };

  const docs = await Document.find(filter)
    .populate("owner", "employeeId fullName")
    .populate("employee", "employeeId fullName")
    .populate("uploadedBy", "fullName")
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ count: docs.length, documents: docs });
});

/* POST /api/documents  (multipart/form-data, field "file") */
exports.upload = catchAsync(async (req, res) => {
  // Check permission
  if (
    !userHasPermission(req.user, "documents:write") &&
    !userHasPermission(req.user, "documents:write_own")
  ) {
    throw ApiError.forbidden("You do not have permission to upload documents.");
  }

  if (!req.file)
    throw ApiError.badRequest(
      'No file uploaded (send it in the "file" field).',
    );

  const category = req.body.category || "Other";
  if (!CATEGORIES.includes(category)) throw ApiError.badRequest("Unknown document category.");
  if (!bytesMatchDeclared(req.file.mimetype, req.file.buffer)) {
    throw ApiError.badRequest("The file content does not match its declared type.");
  }

  const canWriteAll = userHasPermission(req.user, "documents:write");
  let owner;
  let employee;
  let visibility = VISIBILITIES.includes(req.body.visibility) ? req.body.visibility : "private";

  if (!canWriteAll) {
    // Own documents only, always private.
    const me = await myEmployee(req.user);
    if (!me) throw ApiError.badRequest('No employee record is linked to your account.');
    owner = me._id;
    employee = me._id;
    visibility = "private";
  } else if (SEES_ALL.includes(req.user.role)) {
    // Admin may file a document for any employee (validated) or company-wide.
    if (req.body.owner) {
      const exists = await Employee.findById(req.body.owner).select("_id");
      if (!exists) throw ApiError.badRequest("Owner employee not found.");
      owner = exists._id;
      employee = exists._id;
    }
  } else {
    // HR: the owner/subject must be within their permitted employee scope.
    const ids = await teamEmployeeIds(req.user);
    if (req.body.owner) {
      if (!ids.some((id) => String(id) === String(req.body.owner))) {
        throw ApiError.forbidden("You can only file documents for employees within your scope.");
      }
      owner = req.body.owner;
      employee = req.body.owner;
    } else {
      const me = await myEmployee(req.user);
      owner = me ? me._id : undefined;
      employee = me ? me._id : undefined;
    }
  }

  const scope = employee ? "personal" : "company";

  // Duplicate protection: the same bytes filed for the same subject cannot be
  // uploaded twice while the first copy is active.
  const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  const dupe = await Document.findOne({
    owner: owner || null,
    category,
    checksum,
    uploadStatus: "active",
  }).select("_id title");
  if (dupe) {
    throw new ApiError(
      409,
      `This exact file is already in the register${dupe.title ? ` as "${dupe.title}"` : ""}.`,
      { existingId: String(dupe._id) },
    );
  }

  const docId = new mongoose.Types.ObjectId();
  const put = await putObject({
    key: `documents/${String(docId)}-${slugName(req.file.originalname)}`,
    buffer: req.file.buffer,
    contentType: req.file.mimetype,
    originalName: req.file.originalname,
    appProperties: { documentId: String(docId), uploadedBy: String(req.user._id) },
  });

  let doc;
  try {
    doc = await Document.create({
      _id: docId,
      title: req.body.title || req.file.originalname,
      category,
      owner,
      employee,
      scope,
      visibility,
      storageKey: put.key,
      storageProvider: put.provider,
      driveFileId: put.driveFileId || undefined,
      driveFolderId: put.folderId || undefined,
      checksum: put.checksum,
      retention: RETAIN_CATEGORIES.has(category) ? "retain" : "standard",
      uploadStatus: "active",
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: put.size,
      uploadedBy: req.user._id,
      uploaderRole: req.user.role,
    });
  } catch (e) {
    // The bytes are already stored — clean up so no orphan is left behind.
    try {
      await removeObject({ provider: put.provider, key: put.key });
    } catch (cleanupErr) {
      console.error("[documents] orphan cleanup failed for", put.driveFileId || put.key, cleanupErr.message);
      logAudit(req, {
        action: "document.upload.orphan",
        targetType: "Document",
        targetId: docId,
        description: `Metadata save failed and storage cleanup also failed (${put.provider}); needs reconciliation.`,
      });
    }
    throw e;
  }

  logAudit(req, {
    action: "document.upload",
    targetType: "Document",
    targetId: doc._id,
    description: `Uploaded ${doc.originalName} (${doc.category}) as ${doc.referenceId} via ${doc.storageProvider}`,
  });

  res.status(201).json({ document: doc });
});

/* GET /api/documents/:id/download  (inline by default, ?download=1 = attachment) */
exports.download = catchAsync(async (req, res) => {
  // Check permission
  if (
    !userHasPermission(req.user, "documents:read") &&
    !userHasPermission(req.user, "documents:read_own") &&
    !userHasPermission(req.user, "documents:download")
  ) {
    throw ApiError.forbidden(
      "You do not have permission to download documents.",
    );
  }

  const doc = await Document.findById(req.params.id);
  if (!doc || doc.uploadStatus === "deleted") throw ApiError.notFound("Document not found.");
  if (!(await canAccessDocument(req.user, doc))) {
    throw ApiError.forbidden("You do not have access to this document.");
  }

  const provider = doc.storageProvider || "cloudflare-r2";
  let result;
  try {
    result = await getObjectStream({ provider, key: doc.storageKey });
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 404) {
      // The bytes are gone (removed outside the app) — flag for reconciliation.
      doc.uploadStatus = "missing";
      await doc.save().catch(() => {});
    }
    throw e;
  }

  const wantsAttachment = req.query.download === "1" || req.query.disposition === "attachment";
  const attachment = wantsAttachment || !VIEWABLE.includes(doc.mimeType);
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  if (doc.size) res.setHeader("Content-Length", String(doc.size));
  res.setHeader("Content-Disposition", contentDisposition(doc.originalName, attachment));
  result.stream.on("error", (err) => {
    console.error("[documents] stream failed:", err.message);
    res.destroy();
  });
  result.stream.pipe(res);
});

/* GET /api/documents/reference/:referenceId/download — download by public reference */
exports.downloadByReference = catchAsync(async (req, res) => {
  const doc = await Document.findOne({
    referenceId: req.params.referenceId,
    uploadStatus: { $ne: "deleted" },
  });
  if (!doc) throw ApiError.notFound("Document not found.");
  if (!(await canAccessDocument(req.user, doc))) {
    throw ApiError.forbidden("You do not have access to this document.");
  }

  const provider = doc.storageProvider || "cloudflare-r2";
  let result;
  try {
    result = await getObjectStream({ provider, key: doc.storageKey });
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 404) {
      doc.uploadStatus = "missing";
      await doc.save().catch(() => {});
    }
    throw e;
  }

  const attachment = req.query.download !== "0";
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  if (doc.size) res.setHeader("Content-Length", String(doc.size));
  res.setHeader("Content-Disposition", contentDisposition(doc.originalName, attachment));
  result.stream.on("error", (err) => {
    console.error("[documents] stream failed:", err.message);
    res.destroy();
  });
  result.stream.pipe(res);
});

/* DELETE /api/documents/:id  (documents:delete) — archive; retained
 * categories keep their bytes, everything else is removed from storage. */
exports.remove = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, "documents:delete")) {
    throw ApiError.forbidden("You do not have permission to delete documents.");
  }

  const doc = await Document.findById(req.params.id);
  if (!doc || doc.uploadStatus === "deleted") throw ApiError.notFound("Document not found.");

  // IDOR check: documents:delete does not mean "delete anyone's document" — a
  // non-admin may only delete a document they own, are the subject of, or that
  // covers an employee within their scope.
  if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const owns = me && doc.owner && String(doc.owner) === String(me._id);
    const isSubject = me && doc.employee && String(doc.employee) === String(me._id);
    const inScope = (doc.owner && (await ownerInScope(req.user, doc.owner))) || (doc.employee && (await ownerInScope(req.user, doc.employee)));
    if (!(doc.visibility === "all" || owns || isSubject || inScope || user.role === "HR")) {
      throw ApiError.forbidden("You do not have access to this document.");
    }
  }

  const retain = doc.retention === "retain" || RETAIN_CATEGORIES.has(doc.category);
  let storageAction = "retained";
  if (!retain) {
    try {
      const r = await removeObject({ provider: doc.storageProvider || "cloudflare-r2", key: doc.storageKey });
      storageAction = r.mode === "absent" ? "already-absent" : r.mode === "trashed" ? "trashed" : "deleted";
    } catch (e) {
      storageAction = "failed";
      console.error("[documents] storage removal failed for", String(doc._id), e.message);
    }
  }

  doc.uploadStatus = "deleted";
  doc.deletedAt = new Date();
  await doc.save();

  logAudit(req, {
    action: "document.delete",
    targetType: "Document",
    targetId: doc._id,
    description: `Archived ${doc.originalName} (${doc.category}); storage: ${storageAction}`,
  });

  res.json({ ok: true, archived: true, storageAction });
});

/* PUT /api/documents/:id/verify  (documents:write + scope) */
exports.verify = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, "documents:write")) {
    throw ApiError.forbidden("You do not have permission to verify documents.");
  }

  const doc = await Document.findById(req.params.id);
  if (!doc || doc.uploadStatus === "deleted") throw ApiError.notFound("Document not found.");

  if (!SEES_ALL.includes(req.user.role)) {
    if (!(await canAccessDocument(req.user, doc))) {
      throw ApiError.forbidden("You do not have access to this document.");
    }
  }

  doc.verified = true;
  doc.verifiedBy = req.user._id;
  doc.verifiedAt = new Date();
  await doc.save();

  logAudit(req, {
    action: "document.verify",
    targetType: "Document",
    targetId: doc._id,
    description: `Verified ${doc.title}`,
  });

  res.json({ ok: true, document: doc });
});
