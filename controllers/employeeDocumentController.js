'use strict';
const crypto = require('crypto');
const mongoose = require('mongoose');
const EmployeeDocument = require('../models/EmployeeDocument');
const Employee = require('../models/Employee');
const { putObject, getObjectStream, removeObject, safeKey } = require('../services/storage');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');
const { contentDisposition } = require('../utils/contentDisposition');

// Categories kept even after "deletion" (archived metadata, bytes retained).
const RETAIN_CATEGORIES = new Set(['payslip', 'contract', 'id_proof', 'certificate', 'hr_manual', 'onsite_manual', 'policy']);

async function myEmployee(user) {
  return Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }).select('_id');
}

function getEmployeeId(document) {
  return document.employee && document.employee._id ? document.employee._id : document.employee;
}

async function canAccessDocument(user, document) {
  // The uploader can always access their own record.
  if (String(document.uploadedBy) === String(user._id)) return true;

  const empId = getEmployeeId(document);
  // The employee the record is about always reaches their own document.
  const me = await myEmployee(user);
  if (me && empId && String(me._id) === String(empId)) return true;

  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;

  if (document.visibility === 'hr_only') return user.role === 'HR';

  if (user.role === 'HR') {
    // HR reaches documents of employees within their scope (assigned +
    // approved access-request grants); company-wide visibility additionally
    // requires documents:read.
    if (document.visibility === 'company') return userHasPermission(user, 'documents:read');
    if (document.visibility === 'team' || document.visibility === 'private') {
      const ids = await teamEmployeeIds(user);
      return ids.some((id) => String(id) === String(empId));
    }
    return false;
  }

  if (document.visibility === 'company') return userHasPermission(user, 'documents:read');
  if (document.visibility === 'team' && user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return ids.some((id) => String(id) === String(empId));
  }
  return false;
}

exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'documents:read') && !userHasPermission(req.user, 'documents:read_own')) {
    throw ApiError.forbidden('You do not have permission to view documents.');
  }

  const { employeeId, category, verified } = req.query;
  const filter = { uploadStatus: { $ne: 'deleted' } };

  if (employeeId) {
    // Check if user can view this employee's documents
    const employee = await Employee.findById(employeeId);
    if (!employee) throw ApiError.notFound('Employee not found.');

    const ids = await (async () => {
      if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) return [String(employee._id)];
      if (req.user.role === 'HR' || req.user.role === 'MANAGER') {
        return (await teamEmployeeIds(req.user)).map(String);
      }
      const me = await myEmployee(req.user);
      return me ? [String(me._id)] : [];
    })();
    if (!ids.includes(String(employee._id))) {
      throw ApiError.forbidden('You do not have permission to view this employee\'s documents.');
    }
    filter.employee = employeeId;
  } else if (req.user.role === 'HR' || req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  } else if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    // Admins may review the whole register.
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
  }

  if (req.query.category) filter.category = req.query.category;
  if (req.query.verified !== undefined) filter.isVerified = req.query.verified === 'true';

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [documents, total] = await Promise.all([
    EmployeeDocument.find(filter)
      .populate('employee', 'employeeId fullName department designation')
      .populate('uploadedBy', 'fullName email')
      .populate('verifiedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    EmployeeDocument.countDocuments(filter),
  ]);

  res.json({ documents, total, page, pages: Math.ceil(total / limit) });
});

exports.getOne = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation user')
    .populate('uploadedBy', 'fullName email')
    .populate('verifiedBy', 'fullName email');

  if (!document || document.uploadStatus === 'deleted') throw ApiError.notFound('Document not found.');

  if (!(await canAccessDocument(req.user, document))) {
    throw ApiError.forbidden('You do not have permission to view this document.');
  }

  res.json({ document });
});

exports.upload = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'documents:write') && !userHasPermission(req.user, 'documents:write_own')) {
    throw ApiError.forbidden('You do not have permission to upload documents.');
  }

  const { employeeId, type, category, visibility } = req.body;
  const file = req.file;

  if (!file) throw ApiError.badRequest('No file uploaded.');
  if (!employeeId) throw ApiError.badRequest('employeeId is required.');

  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found.');

  // Check if user can upload for this employee
  if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    if (!me || String(me._id) !== String(employeeId)) {
      throw ApiError.forbidden('You can only upload documents for yourself.');
    }
  } else if (req.user.role === 'MANAGER' || req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some((id) => String(id) === String(employeeId))) {
      throw ApiError.forbidden(req.user.role === 'MANAGER'
        ? 'You can only upload documents for your team members.'
        : 'You can only upload documents for your assigned employees.');
    }
  }

  const docCategory = category || 'personal';
  const buffer = file.buffer;
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  // Duplicate protection for the same employee + category.
  const dupe = await EmployeeDocument.findOne({
    employee: employeeId,
    category: docCategory,
    checksum,
    uploadStatus: 'active',
  }).select('_id');
  if (dupe) {
    throw new ApiError(409, 'This exact file already exists for this employee.', { existingId: String(dupe._id) });
  }

  const docId = new mongoose.Types.ObjectId();
  const slug = String(file.originalname || 'document').toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60) || 'document';
  const put = await putObject({
    key: `documents/${employeeId}/${String(docId)}-${slug}`,
    buffer,
    contentType: file.mimetype,
    originalName: file.originalname,
    appProperties: { documentId: String(docId), employeeId: String(employeeId), uploadedBy: String(req.user._id) },
  });

  let document;
  try {
    document = await EmployeeDocument.create({
      _id: docId,
      employee: employeeId,
      type: type || 'Document',
      category: docCategory,
      fileKey: put.key,
      storageProvider: put.provider,
      driveFileId: put.driveFileId || undefined,
      driveFolderId: put.folderId || undefined,
      checksum: put.checksum,
      retention: RETAIN_CATEGORIES.has(docCategory) ? 'retain' : 'standard',
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: put.size,
      uploadedBy: req.user._id,
      uploaderRole: req.user.role,
      visibility: visibility || (req.user.role === 'EMPLOYEE' ? 'private' : 'team'),
    });
  } catch (e) {
    // Clean up the stored bytes so no orphan is left behind.
    try {
      await removeObject({ provider: put.provider, key: put.key });
    } catch (cleanupErr) {
      console.error('[employee-documents] orphan cleanup failed for', put.driveFileId || put.key, cleanupErr.message);
      logAudit(req, {
        action: 'document.upload.orphan',
        targetType: 'EmployeeDocument',
        targetId: docId,
        description: `Metadata save failed and storage cleanup also failed (${put.provider}); needs reconciliation.`,
      });
    }
    if (e && e.code === 11000) throw ApiError.conflict('This document already exists.');
    throw e;
  }

  logAudit(req, {
    action: 'document.upload',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Uploaded document ${file.originalname} for employee ${employeeId} via ${put.provider}`,
  });

  res.status(201).json({ document });
});

exports.download = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id)
    .populate('employee', 'employeeId fullName');

  if (!document || document.uploadStatus === 'deleted') throw ApiError.notFound('Document not found.');

  if (!(await canAccessDocument(req.user, document))) {
    throw ApiError.forbidden('You do not have permission to download this document.');
  }

  const provider = document.storageProvider || 'local';
  let result;
  try {
    result = await getObjectStream({ provider, key: document.fileKey });
  } catch (e) {
    if (provider === 'google-drive' && e instanceof ApiError && e.statusCode === 404) {
      document.uploadStatus = 'missing';
      await document.save().catch(() => {});
    }
    throw e;
  }

  res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
  if (document.fileSize) res.setHeader('Content-Length', String(document.fileSize));
  res.setHeader('Content-Disposition', contentDisposition(document.originalName, req.query.inline !== '1'));
  result.stream.on('error', (err) => {
    console.error('[employee-documents] stream failed:', err.message);
    res.destroy();
  });
  result.stream.pipe(res);
});

exports.update = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id);
  if (!document || document.uploadStatus === 'deleted') throw ApiError.notFound('Document not found.');

  // Check if user can modify this document
  const canModify = userHasPermission(req.user, 'documents:write') || String(document.uploadedBy) === String(req.user._id);
  if (!canModify) throw ApiError.forbidden('You do not have permission to modify this document.');

  if (req.body.type !== undefined) document.type = req.body.type;
  if (req.body.category !== undefined) document.category = req.body.category;
  if (req.body.visibility !== undefined) document.visibility = req.body.visibility;
  if (req.body.isVerified !== undefined) {
    document.isVerified = req.body.isVerified;
    if (req.body.isVerified) {
      document.verifiedBy = req.user._id;
      document.verifiedAt = new Date();
    } else {
      document.verifiedBy = undefined;
      document.verifiedAt = undefined;
    }
  }

  await document.save();

  logAudit(req, {
    action: 'document.update',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Updated document ${document.type} for employee ${getEmployeeId(document)}`,
  });

  const populated = await EmployeeDocument.findById(document._id)
    .populate('employee', 'employeeId fullName department designation')
    .populate('uploadedBy', 'fullName email')
    .populate('verifiedBy', 'fullName email');

  res.json({ document: populated });
});

exports.verify = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'documents:verify')) {
    throw ApiError.forbidden('You do not have permission to verify documents.');
  }

  const document = await EmployeeDocument.findById(req.params.id);
  if (!document || document.uploadStatus === 'deleted') throw ApiError.notFound('Document not found.');

  document.isVerified = true;
  document.verifiedBy = req.user._id;
  document.verifiedAt = new Date();
  await document.save();

  logAudit(req, {
    action: 'document.verify',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Verified document ${document.type} for employee ${getEmployeeId(document)}`,
  });

  res.json({ message: 'Document verified successfully.' });
});

exports.delete = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id);
  if (!document || document.uploadStatus === 'deleted') throw ApiError.notFound('Document not found.');

  const canDelete = userHasPermission(req.user, 'documents:delete') || String(document.uploadedBy) === String(req.user._id);
  if (!canDelete) throw ApiError.forbidden('You do not have permission to delete this document.');

  // Retained categories (payroll/HR records) keep their bytes; everything else
  // is moved to the provider trash (recoverable) — never hard-deleted here.
  const retain = document.retention === 'retain' || RETAIN_CATEGORIES.has(document.category);
  let storageAction = 'retained';
  if (!retain) {
    try {
      const r = await removeObject({ provider: document.storageProvider || 'local', key: document.fileKey });
      storageAction = r.mode === 'absent' ? 'already-absent' : r.mode === 'trashed' ? 'trashed' : 'deleted';
    } catch (e) {
      storageAction = 'failed';
      console.error('[employee-documents] storage removal failed for', String(document._id), e.message);
    }
  }

  document.uploadStatus = 'deleted';
  document.deletedAt = new Date();
  await document.save();

  logAudit(req, {
    action: 'document.delete',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Archived document ${document.type} for employee ${getEmployeeId(document)}; storage: ${storageAction}`,
  });

  res.json({ ok: true, archived: true, storageAction, message: 'Document deleted.' });
});

exports.getSignedUrl = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id);
  if (!document || document.uploadStatus === 'deleted') throw ApiError.notFound('Document not found.');

  if (!(await canAccessDocument(req.user, document))) {
    throw ApiError.forbidden('You do not have permission to access this document.');
  }

  if ((document.storageProvider || 'local') === 'google-drive') {
    // Drive files are never linked directly — hand back the authorised stream.
    return res.json({ url: `/api/employee-documents/${document._id}/download`, provider: 'google-drive' });
  }
  return res.json({ url: `/uploads/${safeKey(document.fileKey)}`, provider: 'local' });
});
