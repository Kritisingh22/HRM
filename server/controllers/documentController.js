/* Documents API with real file upload/download and object-level access.
<<<<<<< HEAD
 *  - HR/Admin: all documents.
 *  - Others: documents with visibility 'all', plus their own.
 * Non-HR uploads are forced to owner=self + visibility=private. Files stream
 * through this controller (which authorises first) — raw paths are never public. */
const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Employee = require('../models/Employee');
const { UPLOAD_DIR } = require('../middleware/upload');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];
async function myEmployee(user) { return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }); }

exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const or = [{ visibility: 'all' }];
=======
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
async function hrScopeFilter(user) {
  const me = await myEmployee(user);
  const ids = await Employee.find({ assignedHrId: user.employeeId }).select(
    "_id",
  );
  const allowed = ids.map((e) => e._id);
  if (me) allowed.push(me._id);
  return { $or: [{ visibility: "all" }, { owner: { $in: allowed } }] };
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
>>>>>>> 0f31467 (intial Update HRM 1.1)
    if (me) or.push({ owner: me._id });
    filter = { $or: or };
  }
  if (req.query.category) filter.category = req.query.category;
<<<<<<< HEAD
  const docs = await Document.find(filter).populate('owner', 'employeeId fullName').sort({ createdAt: -1 }).limit(500);
=======
  const docs = await Document.find(filter)
    .populate("owner", "employeeId fullName")
    .sort({ createdAt: -1 })
    .limit(500);
>>>>>>> 0f31467 (intial Update HRM 1.1)
  res.json({ count: docs.length, documents: docs });
});

/* POST /api/documents  (multipart/form-data, field "file") */
exports.upload = catchAsync(async (req, res) => {
<<<<<<< HEAD
  if (!req.file) throw ApiError.badRequest('No file uploaded (send it in the "file" field).');
  let owner = req.body.owner || undefined;
  let visibility = req.body.visibility || 'private';
  if (!SEES_ALL.includes(req.user.role)) {           // non-HR may only upload their own private docs
    const me = await myEmployee(req.user);
    owner = me ? me._id : undefined;
    visibility = 'private';
  }
  const doc = await Document.create({
    title: req.body.title || req.file.originalname,
    category: req.body.category || 'Other',
    owner, visibility,
    storageKey: req.file.filename, originalName: req.file.originalname,
    mimeType: req.file.mimetype, size: req.file.size, uploadedBy: req.user._id
=======
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
>>>>>>> 0f31467 (intial Update HRM 1.1)
  });
  res.status(201).json({ document: doc });
});

/* GET /api/documents/:id/download */
exports.download = catchAsync(async (req, res) => {
<<<<<<< HEAD
  const doc = await Document.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Document not found.');
  if (!SEES_ALL.includes(req.user.role)) {
    const me = await myEmployee(req.user);
    const owns = me && doc.owner && String(doc.owner) === String(me._id);
    if (!(doc.visibility === 'all' || owns)) throw ApiError.forbidden('You do not have access to this document.');
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(doc.storageKey)); // basename blocks path traversal
  if (!fs.existsSync(filePath)) throw ApiError.notFound('File is missing on the server.');
=======
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
    const me = await myEmployee(req.user);
    const assigned = await Employee.find({
      assignedHrId: req.user.employeeId,
    }).select("_id");
    const allowed = assigned.map((e) => String(e._id));
    if (me) allowed.push(String(me._id));
    const owns = me && doc.owner && String(doc.owner) === String(me._id);
    const assignedOwner = doc.owner && allowed.includes(String(doc.owner));
    if (!(doc.visibility === "all" || owns || assignedOwner))
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
>>>>>>> 0f31467 (intial Update HRM 1.1)
  res.download(filePath, doc.originalName);
});

/* DELETE /api/documents/:id  (documents:delete) */
exports.remove = catchAsync(async (req, res) => {
<<<<<<< HEAD
  const doc = await Document.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Document not found.');
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(doc.storageKey))); } catch (e) { /* file may already be gone */ }
=======
  // Check permission
  if (!userHasPermission(req.user, "documents:delete")) {
    throw ApiError.forbidden("You do not have permission to delete documents.");
  }

  const doc = await Document.findById(req.params.id);
  if (!doc) throw ApiError.notFound("Document not found.");
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(doc.storageKey)));
  } catch (e) {
    /* file may already be gone */
  }
>>>>>>> 0f31467 (intial Update HRM 1.1)
  await doc.deleteOne();
  res.json({ ok: true });
});
