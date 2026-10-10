'use strict';
const EmployeeDocument = require('../models/EmployeeDocument');
const Employee = require('../models/Employee');
const { uploadToStorage, getSignedUrl, deleteFromStorage } = require('../services/storage');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');

async function canAccessDocument(user, document) {
  // Owner can always access
  if (String(document.uploadedBy) === String(user._id)) return true;
  if (String(document.employee.user) === String(user._id)) return true;

  // Check visibility
  if (document.visibility === 'company') return userHasPermission(user, 'documents:read');
  if (document.visibility === 'hr_only') return ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
  if (document.visibility === 'team') {
    if (user.role === 'MANAGER') {
      const ids = await teamEmployeeIds(user);
      return ids.some(id => String(id) === String(document.employee._id));
    }
  }
  if (document.visibility === 'private') {
    return String(document.uploadedBy) === String(user._id);
  }
  return false;
}

exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'documents:read')) {
    throw ApiError.forbidden('You do not have permission to view documents.');
  }

  const { employeeId, category, verified } = req.query;
  const filter = {};

  if (employeeId) {
    // Check if user can view this employee's documents
    const employee = await Employee.findById(employeeId);
    if (!employee) throw ApiError.notFound('Employee not found.');

    const ids = await (async () => {
      if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) return [employee._id];
      if (req.user.role === 'HR') {
        return (await require('../utils/teamScope').teamEmployeeIds(req.user)).map(String);
      }
      if (req.user.role === 'MANAGER') {
        return (await require('../utils/teamScope').teamEmployeeIds(req.user)).map(String);
      }
      return [req.user.employeeId];
    })();
    if (!ids.includes(String(employee._id))) {
      throw ApiError.forbidden('You do not have permission to view this employee\'s documents.');
    }
    filter.employee = employeeId;
  } else if (req.user.role === 'HR' || req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  } else {
    const Employee = require('../models/Employee');
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
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

  if (!document) throw ApiError.notFound('Document not found.');

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
  } else if (req.user.role === 'MANAGER') {
    const { teamEmployeeIds } = require('../utils/teamScope');
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(employeeId))) {
      throw ApiError.forbidden('You can only upload documents for your team members.');
    }
  } else if (req.user.role === 'HR') {
    // HR can upload for assigned employees
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(employeeId))) {
      throw ApiError.forbidden('You can only upload documents for your assigned employees.');
    }
  }

  const fileKey = `documents/${employeeId}/${Date.now()}-${req.file.originalname}`;
  await uploadToStorage(fileKey, req.file.buffer, req.file.mimetype);

  const document = await EmployeeDocument.create({
    employee: employeeId,
    type: req.body.type || 'Document',
    category: category || 'personal',
    fileKey,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    uploadedBy: req.user._id,
    visibility: visibility || (req.user.role === 'EMPLOYEE' ? 'private' : 'team'),
  });

  logAudit(req, {
    action: 'document.upload',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Uploaded document ${req.file.originalname} for employee ${employeeId}`,
  });

  res.status(201).json({ document });
});

exports.download = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id)
    .populate('employee', 'employeeId fullName');

  if (!document) throw ApiError.notFound('Document not found.');

  if (!(await canAccessDocument(req.user, document))) {
    throw ApiError.forbidden('You do not have permission to download this document.');
  }

  const signedUrl = await getSignedUrl(document.fileKey, 3600);
  res.redirect(signedUrl);
});

exports.update = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found.');

  // Check if user can modify this document
  const canModify = userHasPermission(req.user, 'documents:write') || String(document.uploadedBy) === String(req.user._id);
  if (!canModify) throw ApiError.forbidden('You do not have permission to modify this document.');

  const { type, category, visibility, isVerified } = req.body;

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
    description: `Updated document ${document.type} for employee ${document.employee.employeeId}`,
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
  if (!document) throw ApiError.notFound('Document not found.');

  document.isVerified = true;
  document.verifiedBy = req.user._id;
  document.verifiedAt = new Date();
  await document.save();

  logAudit(req, {
    action: 'document.verify',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Verified document ${document.type} for employee ${document.employee.employeeId}`,
  });

  res.json({ message: 'Document verified successfully.' });
});

exports.delete = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found.');

  const canDelete = userHasPermission(req.user, 'documents:delete') || String(document.uploadedBy) === String(req.user._id);
  if (!canDelete) throw ApiError.forbidden('You do not have permission to delete this document.');

  await deleteFromStorage(document.fileKey);
  await document.deleteOne();

  logAudit(req, {
    action: 'document.delete',
    targetType: 'EmployeeDocument',
    targetId: document._id,
    description: `Deleted document ${document.type} for employee ${document.employee.employeeId}`,
  });

  res.json({ ok: true, message: 'Document deleted.' });
});

exports.getSignedUrl = catchAsync(async (req, res) => {
  const document = await EmployeeDocument.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found.');

  if (!(await canAccessDocument(req.user, document))) {
    throw ApiError.forbidden('You do not have permission to access this document.');
  }

  const signedUrl = await getSignedUrl(document.fileKey, 3600);
  res.json({ url: signedUrl });
});