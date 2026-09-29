/* Documents API with real file upload/download and object-level access.
 *  - HR/Admin: all documents (with proper permissions).
 *  - Others: documents with visibility 'all', plus their own.
 * Non-HR uploads are forced to owner=self + visibility=private. Files stream
 * through this controller (which authorises first) — raw paths are never public. */
const fs = require("fs");
const path = require("path");
const Document = require("../models/Document");
const Employee = require("../models/Employee");
const { UPLOAD_DIR } = require("../middleware/upload");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { userHasPermission } = require("../utils/permissions");

const SEES_ALL = ["ADMIN", "SUPER_ADMIN"];
async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}
// Shared scoping (single source of truth — see utils/teamScope.js). Also picks
// up any live approved access-request grant, which the old local
// hrScopeFilter/assignedHrId lookups here never did.
const { teamEmployeeIds } = require("../utils/teamScope");
async function hrScopeFilter(user) {
  const allowed = await teamEmployeeIds(user);
  return { $or: [{ visibility: "all" }, { owner: { $in: allowed } }] };
}
// True if this document's owner is within the caller's scope (self, assigned
// employees, or a live access-request grant) — used to gate delete, the same
// way download already gates reads.
async function ownerInScope(user, ownerId) {
  if (!ownerId) return false;
  const ids = await teamEmployeeIds(user);
  return ids.some((id) => String(id) === String(ownerId));
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
    // Admin/Super Admin with permission: see all
  } else if (req.user.role === "HR") {
    filter = await hrScopeFilter(req.user);
  } else if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const or = [{ visibility: "all" }];
    if (me) or.push({ owner: me._id });
    filter = { $or: or };
  } else {
    // HR without documents:read permission - see only public + own
    const me = await myEmployee(req.user);
    const or = [{ visibility: "all" }];
    if (me) or.push({ owner: me._id });
    filter = { $or: or };
  }
  if (req.query.category) filter.category = req.query.category;
  const docs = await Document.find(filter)
    .populate("owner", "employeeId fullName")
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
  let owner = req.body.owner || undefined;
  let visibility = req.body.visibility || "private";
  if (!SEES_ALL.includes(req.user.role)) {
    // non-HR may only upload their own private docs
    const me = await myEmployee(req.user);
    owner = me ? me._id : undefined;
    visibility = "private";
  } else if (!userHasPermission(req.user, "documents:write")) {
    // HR without write permission - can only upload own private
    const me = await myEmployee(req.user);
    owner = me ? me._id : undefined;
    visibility = "private";
  }
  const doc = await Document.create({
    title: req.body.title || req.file.originalname,
    category: req.body.category || "Other",
    owner,
    visibility,
    storageKey: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user._id,
  });
  res.status(201).json({ document: doc });
});

/* GET /api/documents/:id/download */
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
  if (!doc) throw ApiError.notFound("Document not found.");
  if (req.user.role === "HR") {
    const owns = doc.owner && (await ownerInScope(req.user, doc.owner));
    if (!(doc.visibility === "all" || owns))
      throw ApiError.forbidden("You do not have access to this document.");
  } else if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const owns = me && doc.owner && String(doc.owner) === String(me._id);
    if (!(doc.visibility === "all" || owns))
      throw ApiError.forbidden("You do not have access to this document.");
  } else if (!userHasPermission(req.user, "documents:read")) {
    // HR without read permission - only public + own
    const me = await myEmployee(req.user);
    const owns = me && doc.owner && String(doc.owner) === String(me._id);
    if (!(doc.visibility === "all" || owns))
      throw ApiError.forbidden("You do not have access to this document.");
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(doc.storageKey)); // basename blocks path traversal
  if (!fs.existsSync(filePath))
    throw ApiError.notFound("File is missing on the server.");
  res.download(filePath, doc.originalName);
});

/* DELETE /api/documents/:id  (documents:delete) */
exports.remove = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, "documents:delete")) {
    throw ApiError.forbidden("You do not have permission to delete documents.");
  }

  const doc = await Document.findById(req.params.id);
  if (!doc) throw ApiError.notFound("Document not found.");

  // IDOR check: documents:delete does not mean "delete anyone's document" — a
  // non-admin may only delete a document that is public, their own, or owned
  // by someone within their scope (assigned employees / access-request grant).
  if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const owns = me && doc.owner && String(doc.owner) === String(me._id);
    const inScope = doc.owner && (await ownerInScope(req.user, doc.owner));
    if (!(doc.visibility === "all" || owns || inScope)) {
      throw ApiError.forbidden("You do not have access to this document.");
    }
  }

  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(doc.storageKey)));
  } catch (e) {
    /* file may already be gone */
  }
  await doc.deleteOne();
  res.json({ ok: true });
});
