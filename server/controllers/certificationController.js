'use strict';
const Certification = require('../models/Certification');
const Employee = require('../models/Employee');
const { putObject, getObjectStream, removeObject } = require('../services/storage');
const { contentDisposition } = require('../utils/contentDisposition');
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

  let storageRemoved = false;
  if (cert.certificateFileKey) {
    try {
      const r = await removeObject({ provider: cert.storageProvider || 'local', key: cert.certificateFileKey });
      storageRemoved = r.removed || r.mode === 'absent';
    } catch (e) {
      console.error('[certifications] storage removal failed:', e.message);
    }
  }

  await cert.deleteOne();

  logAudit(req, {
    action: 'certification.delete',
    targetType: 'Certification',
    targetId: cert._id,
    description: `Deleted certification ${cert.name} for employee ${cert.employee.employeeId}`,
  });

  res.json({ ok: true, storageRemoved, message: 'Certification deleted.' });
});

exports.uploadCertificateFile = catchAsync(async (req, res) => {
  const cert = await Certification.findById(req.params.id);
  if (!cert) throw ApiError.notFound('Certification not found.');

  if (!(await canAccessCertification(req.user, cert)) || !userHasPermission(req.user, 'certifications:write')) {
    throw ApiError.forbidden('You do not have permission to upload certificate file.');
  }

  const file = req.file;
  if (!file) throw ApiError.badRequest('No file uploaded.');

  const slug = String(file.originalname || 'certificate').toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60) || 'certificate';
  const put = await putObject({
    key: `certifications/${cert.employee}/${Date.now()}-${slug}`,
    buffer: file.buffer,
    contentType: file.mimetype,
    originalName: file.originalname,
    appProperties: { certificationId: String(cert._id), employeeId: String(cert.employee) },
  });

  // Replace the previous file (best effort — leftovers are recoverable).
  if (cert.certificateFileKey) {
    try {
      await removeObject({ provider: cert.storageProvider || 'local', key: cert.certificateFileKey });
    } catch (e) {
      console.error('[certifications] old certificate removal failed:', e.message);
    }
  }

  cert.certificateFileKey = put.key;
  cert.storageProvider = put.provider;
  cert.driveFileId = put.driveFileId || undefined;
  cert.checksum = put.checksum;
  cert.certificateOriginalName = file.originalname;
  cert.certificateMimeType = file.mimetype;
  cert.certificateSize = put.size;
  try {
    await cert.save();
  } catch (e) {
    // Metadata failed to save — do not leave a stray upload behind.
    await removeObject({ provider: put.provider, key: put.key }).catch(() => {});
    throw e;
  }

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

  const provider = cert.storageProvider || 'local';
  const { stream } = await getObjectStream({ provider, key: cert.certificateFileKey });
  res.setHeader('Content-Type', cert.certificateMimeType || 'application/octet-stream');
  if (cert.certificateSize) res.setHeader('Content-Length', String(cert.certificateSize));
  res.setHeader('Content-Disposition', contentDisposition(cert.certificateOriginalName || `certificate-${String(cert._id)}`, req.query.inline !== '1'));
  stream.on('error', (err) => {
    console.error('[certifications] stream failed:', err.message);
    res.destroy();
  });
  stream.pipe(res);
});