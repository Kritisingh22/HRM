/* Payslip Archive Service — complete end-to-end payslip PDF workflow.
 *
 * Handles the complete workflow when a payslip is downloaded:
 * 1. Generate PDF from real payroll record
 * 2. Store in Cloudflare R2 (the single production storage provider)
 * 3. Save metadata in MongoDB with status tracking
 * 4. Prevent duplicates via idempotency keys
 * 5. Return status information to caller
 *
 * Google Drive integration has been removed — R2 is the only storage provider.
 */
'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const { buildPayslipPdf, payslipFilename } = require('./payslipPdf');
const { putObject, getObjectStream } = require('./storage');
const Document = require('../models/Document');
const Payroll = require('../models/Payroll');
const SalaryStructure = require('../models/SalaryStructure');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/audit');
const cfg = require('../config/env');

/* ---------- Status constants ---------- */
const STORAGE_STATUS = {
  GENERATED: 'generated',
  DOWNLOAD_READY: 'download_ready',
  SERVER_SAVED: 'server_saved',
  FAILED: 'failed'
};

const MAX_R2_RETRIES = 3;

/* ---------- Helper functions ---------- */

function generateDocumentId(employeeId, period) {
  return `${employeeId}_${period}`;
}

function computeChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function getPayslipWithDetails(payrollId) {
  const slip = await Payroll.findById(payrollId)
    .populate('employee', 'employeeId fullName department designation employmentType location joiningDate bankName accountNumber')
    .populate('salaryStructure');

  if (!slip) throw new Error('Payslip not found');
  if (!slip.employee) throw new Error('Employee not found for payslip');

  // Try to get salary structure if not linked
  if (!slip.salaryStructure && slip.employee) {
    slip.salaryStructure = await SalaryStructure.findOne({
      employee: slip.employee._id,
      isActive: true,
    }).sort({ effectiveFrom: -1 });
  }

  return slip;
}

/**
 * Generate PDF bytes from payroll record
 */
async function generatePayslipBytes(payrollId) {
  const slip = await getPayslipWithDetails(payrollId);
  const companyProfile = {
    name: cfg.COMPANY_NAME,
    address: cfg.COMPANY_ADDRESS,
    email: cfg.COMPANY_EMAIL,
    phone: cfg.COMPANY_PHONE,
    website: cfg.COMPANY_WEBSITE,
  };

  const bytes = await buildPayslipPdf({
    payroll: slip,
    employee: slip.employee,
    salaryStructure: slip.salaryStructure,
    company: companyProfile,
    currency: cfg.PAYROLL_CURRENCY,
  });

  const filename = payslipFilename(slip.employee.employeeId, slip.period);

  return { bytes, filename, slip };
}

/**
 * Check if document already exists for this payroll
 */
async function findExistingArchive(payrollId) {
  return Document.findOne({
    relatedModel: 'Payroll',
    relatedId: payrollId,
    uploadStatus: 'active',
  }).select('_id uploadStatus storageProvider storageKey checksum size createdAt');
}

/**
 * Save or update document metadata in MongoDB
 */
async function upsertDocumentMetadata({
  payrollId,
  employeeId,
  filename,
  storageProvider,
  fileKey,
  checksum,
  fileSize,
  uploadStatus,
  uploadedBy,
  uploaderRole,
  errorMessage = null,
  existingDoc = null
}) {
  const docId = existingDoc?._id || new mongoose.Types.ObjectId();

  // Map custom status to valid schema enum
  const mapUploadStatus = (status) => {
    if (status === 'failed') return 'missing';
    if (status === 'server_saved' || status === 'generated' || status === 'download_ready') return 'active';
    if (status === 'deleted') return 'deleted';
    return 'active';
  };

  const metadata = {
    _id: docId,
    title: filename,
    employee: employeeId,
    owner: employeeId,
    scope: 'personal',
    type: `Payslip ${existingDoc?.type?.split(' ')[1] || 'Payslip'}`,
    category: 'payslip',
    storageKey: fileKey,
    originalName: filename,
    mimeType: 'application/pdf',
    size: fileSize,
    uploadedBy,
    uploaderRole: 'system', // system-generated
    visibility: 'private',
    storageProvider,
    checksum,
    uploadStatus: mapUploadStatus(uploadStatus),
    retention: 'retain',
    relatedModel: 'Payroll',
    relatedId: payrollId,
  };

  if (existingDoc) {
    await Document.findByIdAndUpdate(docId, { $set: metadata });
    return { existing: true, documentId: docId };
  } else {
    await Document.create(metadata);
    return { existing: false, documentId: docId };
  }
}

/**
 * Main archive function - generates PDF, stores in R2, tracks in MongoDB
 * @returns {Object} Result with download info and storage status
 */
async function archivePayslip(payrollId, userId, userRole, options = {}) {
  const { forceRegenerate = false } = options;

  // Generate PDF
  const { bytes, filename, slip } = await generatePayslipBytes(payrollId);
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const employeeId = slip.employee._id;
  const storageKey = `payslips/${slip.employee.employeeId}/${filename}`;

  // Check for existing archive
  const existingDoc = await findExistingArchive(payrollId);

  if (existingDoc && !forceRegenerate) {
    return {
      success: true,
      alreadyExists: true,
      downloadUrl: `/api/payroll/${payrollId}/download`,
      driveUrl: null,
      driveFileId: null,
      status: existingDoc.uploadStatus,
      documentId: existingDoc._id,
    };
  }

  // Store in R2 (primary storage)
  let storageResult;
  const buffer = Buffer.from(bytes);

  try {
    storageResult = await putObject({
      key: storageKey,
      buffer,
      contentType: 'application/pdf',
      originalName: filename,
      appProperties: {
        documentType: 'payslip',
        employeeId: slip.employee.employeeId,
        period: slip.period,
        payrollId: String(slip._id),
        generatedAt: new Date().toISOString(),
        checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
      },
    });
  } catch (storageError) {
    console.error('[payslipArchive] Primary storage failed:', storageError.message);
    throw new Error(`Failed to store payslip: ${storageError.message}`);
  }

  // Create/Update MongoDB metadata
  await upsertDocumentMetadata({
    payrollId: slip._id,
    employeeId: slip.employee._id,
    filename,
    storageProvider: storageResult.provider,
    fileKey: storageResult.key,
    checksum,
    fileSize: bytes.length,
    uploadStatus: 'server_saved',
    uploadedBy: userId, // system user who initiated the download
    uploaderRole: 'system',
    existingDoc: null,
  });

  // Log audit
  await logAudit({ user: { _id: 'system', role: 'system' } }, {
    action: 'payslip.archive',
    targetType: 'Payroll',
    targetId: payrollId,
    description: `Archived payslip PDF for ${slip.employee.employeeId} ${slip.period} via ${storageResult.provider}`,
  });

  return {
    success: true,
    downloadUrl: `/api/payroll/${payrollId}/download`,
    driveUrl: null,
    driveFileId: null,
    storageProvider: storageResult.provider,
    status: 'server_saved',
    documentId: (await findExistingArchive(payrollId))?._id,
    alreadyExists: false,
  };
}

/**
 * Get archive status for a payslip
 */
async function getArchiveStatus(payrollId) {
  const doc = await findExistingArchive(payrollId);
  if (!doc) return { archived: false };

  return {
    archived: true,
    documentId: doc._id,
    uploadStatus: doc.uploadStatus,
    storageProvider: doc.storageProvider,
    fileSize: doc.fileSize,
    checksum: doc.checksum,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    uploadError: null,
    uploadAttempts: null,
  };
}

/**
 * Retry failed R2 upload
 */
async function retryR2Upload(payrollId, userId, userRole) {
  const doc = await findExistingArchive(payrollId);
  if (!doc) throw new Error('No archive found for this payslip');

  const slip = await getPayslipWithDetails(payrollId);
  const filename = require('./payslipPdf').payslipFilename(slip.employee.employeeId, slip.period);
  const storageKey = `payslips/${slip.employee.employeeId}/${filename}`;

  // Get file from storage
  const { stream } = await getObjectStream({ provider: doc.storageProvider, key: doc.storageKey });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  try {
    const storageResult = await putObject({
      key: storageKey,
      buffer,
      contentType: 'application/pdf',
      originalName: filename,
      appProperties: {
        documentType: 'payslip',
        employeeId: slip.employee.employeeId,
        period: slip.period,
        payrollId: String(payrollId),
        generatedAt: new Date().toISOString(),
        checksum: doc.checksum,
        retryAttempt: 1,
      },
    });

    await upsertDocumentMetadata({
      payrollId: slip._id,
      employeeId: slip.employee._id,
      filename,
      storageProvider: storageResult.provider,
      storageKey: storageResult.key,
      checksum: doc.checksum,
      size: doc.size,
      uploadStatus: 'server_saved',
      uploadedBy: userId,
      uploaderRole: 'system',
      existingDoc: doc,
    });

    return { success: true };
  } catch (error) {
    await upsertDocumentMetadata({
      payrollId: slip._id,
      employeeId: slip.employee._id,
      filename,
      storageProvider: doc.storageProvider,
      storageKey: doc.storageKey,
      checksum: doc.checksum,
      size: doc.size,
      uploadStatus: 'failed',
      uploadedBy: userId,
      uploaderRole: 'system',
      errorMessage: error.message,
      existingDoc: doc,
    });
    throw error;
  }
}

/**
 * Helper to convert stream to buffer
 */
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Get existing archive document
 */
async function getArchiveDocument(payrollId) {
  return findExistingArchive(payrollId);
}

module.exports = {
  STORAGE_STATUS,
  archivePayslip,
  getArchiveStatus,
  retryR2Upload,
  getArchiveDocument,
  generatePayslipBytes,
  findExistingArchive,
  upsertDocumentMetadata,
};