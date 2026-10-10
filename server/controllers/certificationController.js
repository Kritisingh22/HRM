'use strict';
const Certification = require('../models/Certification');
const Employee = require('../models/Employee');
const { uploadToStorage, getSignedUrl, deleteFromStorage } = require('../services/storage');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
const { teamEmployeeIds } = require('../utils/teamScope');

async function canAccessCertification(user, cert) {
  if (String(cert.employee.user) === String(user._id)) return true;
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  if (user.role === 'HR') {
    const ids = await teamEmployeeIds(user);
    return ids.some(id => String(id) === String(cert.employee._id));
  }
  if (user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user);
    return ids.some(id => String(id) === String(cert.employee._id));
  }
  return false;
}

exports.list = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'certifications:read')) {
    throw ApiError.forbidden('You do not have permission to view certifications.');
  }

  const { employeeId } = req.query;
  const filter = {};

  if (employeeId) {
    // Check access
    if (req.user.role === 'EMPLOYEE') {
      const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
      if (String(me?._id) !== String(employeeId)) {
        throw ApiError.forbidden('You can only view your own certifications.');
      }
    } else if (req.user.role === 'MANAGER') {
      const ids = await teamEmployeeIds(req.user);
      if (!ids.some(id => String(id) === String(employeeId))) {
        throw ApiError.forbidden('You can only view certifications for your team members.');
      }
    }
    filter.employee = employeeId;
  } else if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    filter.employee = me?._id;
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  } else if (req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [certifications, total] = await Promise.all([
    Certification.find(filter)
      .populate('employee', 'employeeId fullName department designation')
      .sort({ issueDate: -1 })
      .skip(skip)
      .limit(limit),
    Certification.countDocuments(filter),
  ]);

  res.json({ certifications, total, page, pages: Math.ceil(total / limit) });
});

exports.getOne = catchAsync(async (req, res) => {
  const cert = await Certification.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation');

  if (!cert) throw ApiError.notFound('Certification not found.');

  if (!(await canAccessCertification(req.user, cert))) {
    throw ApiError.forbidden('You do not have permission to view this certification.');
  }

  res.json({ certification: cert });
});

exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'certifications:write')) {
    throw ApiError.forbidden('You do not have permission to add certifications.');
  }

  const { employeeId, name, issuer, issueDate, expiryDate, certificateFileKey, credentialId, credentialUrl } = req.body;

  if (!employeeId || !name || !issueDate) {
    throw ApiError.badRequest('employeeId, name, and issueDate are required.');
  }

  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found.');

  // Check permissions
  if (req.user.role === 'EMPLOYEE') {
    const me = await Employee.findOne({ $or: [{ user: req.user._id }, { employeeId: req.user.employeeId }] });
    if (String(me?._id) !== String(employeeId)) {
      throw ApiError.forbidden('You can only add certifications for yourself.');
    }
  } else if (req.user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(employeeId))) {
      throw ApiError.forbidden('You can only add certifications for your team members.');
    }
  } else if (req.user.role === 'HR') {
    const ids = await teamEmployeeIds(req.user);
    if (!ids.some(id => String(id) === String(employeeId))) {
      throw ApiError.forbidden('You can only add certifications for your assigned employees.');
    }
  }

  const cert = await Certification.create({
    employee: employeeId,
    name,
    issuer,
    issueDate,
    expiryDate,
    certificateFileKey,
    credentialId,
    credentialUrl,
  });

  logAudit(req, {
    action: 'certification.create',
    targetType: 'Certification',
    targetId: cert._id,
    description: `Added certification ${cert.name} for employee ${employee.employeeId}`,
  });

  res.status(201).json({ certification: cert });
});

exports.update = catchAsync(async (req, res) => {
  const cert = await Certification.findById(req.params.id);
  if (!cert) throw ApiError.notFound('Certification not found.');

  if (!(await canAccessCertification(req.user, cert)) || !userHasPermission(req.user, 'certifications:write')) {
    throw ApiError.forbidden('You do not have permission to update this certification.');
  }

  const { name, issuer, issueDate, expiryDate, certificateFileKey, credentialId, credentialUrl } = req.body;

  if (name !== undefined) cert.name = name;
  if (issuer !== undefined) cert.issuer = issuer;
  if (issueDate !== undefined) cert.issueDate = issueDate;
  if (expiryDate !== undefined) cert.expiryDate = expiryDate;
  if (certificateFileKey !== undefined) cert.certificateFileKey = certificateFileKey;
  if (credentialId !== undefined) cert.credentialId = credentialId;
  if (credentialUrl !== undefined) cert.credentialUrl = credentialUrl;

  await cert.save();

  logAudit(req, {
    action: 'certification.update',
    targetType: 'Certification',
    targetId: cert._id,
    description: `Updated certification ${cert.name} for employee ${cert.employee.employeeId}`,
  });

  res.json({ certification: cert });
});

exports.delete = catchAsync(async (req, res) => {
  const cert = await Certification.findById(req.params.id);
  if (!cert) throw ApiError.notFound('Certification not found.');

  if (!(await canAccessCertification(req.user, cert)) || !userHasPermission(req.user, 'certifications:delete')) {
    throw ApiError.forbidden('You do not have permission to delete this certification.');
  }

  if (cert.certificateFileKey) {
    await deleteFromStorage(cert.certificateFileKey);
  }

  await cert.deleteOne();

  logAudit(req, {
    action: 'certification.delete',
    targetType: 'Certification',
    targetId: cert._id,
    description: `Deleted certification ${cert.name} for employee ${cert.employee.employeeId}`,
  });

  res.json({ ok: true, message: 'Certification deleted.' });
});

exports.uploadCertificateFile = catchAsync(async (req, res) => {
  const cert = await Certification.findById(req.params.id);
  if (!cert) throw ApiError.notFound('Certification not found.');

  if (!(await canAccessCertification(req.user, cert)) || !userHasPermission(req.user, 'certifications:write')) {
    throw ApiError.forbidden('You do not have permission to upload certificate file.');
  }

  const file = req.file;
  if (!file) throw ApiError.badRequest('No file uploaded.');

  const fileKey = `certifications/${cert.employee}/${Date.now()}-${file.originalname}`;
  await uploadToStorage(fileKey, file.buffer, file.mimetype);

  // Delete old file if exists
  if (cert.certificateFileKey) {
    await deleteFromStorage(cert.certificateFileKey);
  }

  cert.certificateFileKey = fileKey;
  await cert.save();

  res.json({ certification: cert });
});

exports.download = catchAsync(async (req, res) => {
  const cert = await Certification.findById(req.params.id);
  if (!cert) throw ApiError.notFound('Certification not found.');

  if (!(await canAccessCertification(req.user, cert))) {
    throw ApiError.forbidden('You do not have permission to download this certificate.');
  }

  if (!cert.certificateFileKey) {
    throw ApiError.notFound('No certificate file available.');
  }

  const signedUrl = await getSignedUrl(cert.certificateFileKey, 3600);
  res.redirect(signedUrl);
});