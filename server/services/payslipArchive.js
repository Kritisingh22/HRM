/* Payslip Archive Service — complete end-to-end payslip PDF workflow.
 *
 * Handles the complete workflow when a payslip is downloaded:
 * 1. Generate PDF from real payroll record
 * 2. Store in configured persistent storage (local/Google Drive)
 * 3. Upload copy to Google Drive (if configured)
 * 4. Save metadata in MongoDB with status tracking
 * 5. Prevent duplicates via idempotency keys
 * 6. Retry failed Google Drive uploads with exponential backoff
 * 7. Return status information to caller
 */
'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const { buildPayslipPdf, payslipFilename } = require('./payslipPdf');
const { putObject, getObjectStream, activeProvider, driveConfigured: storageDriveConfigured } = require('./storage');
const driveModule = require('./googleDrive');
const EmployeeDocument = require('../models/EmployeeDocument');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const SalaryStructure = require('../models/SalaryStructure');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const cfg = require('../config/env');

/* ---------- Status constants ---------- */
const STORAGE_STATUS = {
  GENERATED: 'generated',
  DOWNLOAD_READY: 'download_ready',
  SERVER_SAVED: 'server_saved',
  DRIVE_UPLOADING: 'drive_uploading',
  DRIVE_UPLOADED: 'drive_uploaded',
  DRIVE_FAILED: 'drive_failed',
  FAILED: 'failed'
};

const MAX_DRIVE_RETRIES = 3;

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
    website: cfg.COMPANY_WEBSITE
  };
  
  const { buildPayslipPdf, payslipFilename } = require('./payslipPdf');
  
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
  return EmployeeDocument.findOne({
    relatedModel: 'Payroll',
    relatedId: payrollId,
    uploadStatus: { $in: ['active', 'drive_uploading', 'drive_uploaded'] }
  }).select('_id uploadStatus driveFileId driveFolderId storageProvider fileKey checksum fileSize createdAt uploadAttempts uploadError');
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
  driveFileId,
  driveFolderId,
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
    if (status === 'drive_failed' || status === 'failed') return 'missing';
    if (status === 'drive_uploading' || status === 'drive_uploaded' || status === 'server_saved' || status === 'generated' || status === 'download_ready') return 'active';
    if (status === 'deleted') return 'deleted';
    return 'active';
  };
  
  const metadata = {
    _id: docId,
    employee: employeeId,
    type: `Payslip ${existingDoc?.type?.split(' ')[1] || 'Payslip'}`,
    category: 'payslip',
    fileKey,
    originalName: filename,
    mimeType: 'application/pdf',
    fileSize,
    uploadedBy,
    uploaderRole: 'system', // system-generated
    visibility: 'private',
    storageProvider,
    driveFileId: driveFileId || undefined,
    driveFolderId: driveFolderId || undefined,
    checksum,
    uploadStatus: mapUploadStatus(uploadStatus),
    retention: 'retain',
    uploadedBy,
    relatedModel: 'Payroll',
    relatedId: payrollId,
  };
  
  if (existingDoc) {
    await EmployeeDocument.findByIdAndUpdate(docId, { $set: metadata });
    return { existing: true, documentId: docId };
  } else {
    await EmployeeDocument.create(metadata);
    return { existing: false, documentId: docId };
  }
}

/**
 * Upload to Google Drive with retries
 */
async function uploadToGoogleDriveWithRetry(buffer, filename, employeeId, period, payrollId, appProperties, maxRetries = 3) {
  const driveModule = require('./googleDrive');
  
  if (!driveModule.isConfigured()) {
    throw new Error('Google Drive is not configured');
  }
  
  let lastError;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const file = await driveModule.uploadFile({
        name: filename,
        buffer,
        mimeType: 'application/pdf',
        parentId: cfg.GOOGLE_DRIVE_FOLDER_ID,
        appProperties: { 
          managedBy: 'cyethack-hrm', 
          ...appProperties,
          uploadAttempt: attempt,
          uploadedAt: new Date().toISOString()
        },
      });
      
      return {
        driveFileId: file.id,
        driveFolderId: cfg.GOOGLE_DRIVE_FOLDER_ID,
        driveUrl: `https://drive.google.com/file/d/${file.id}/view`,
        uploadAttempt: attempt
      };
    } catch (error) {
      const isRetryable = error.status === 429 || 
                          error.status >= 500 || 
                          ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED'].includes(error.code);
      
      if (attempt === 3 || !isRetryable) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError;
}

/**
 * Main archive function - generates PDF, stores locally/Drive, tracks in MongoDB
 * @returns {Object} Result with download info and storage status
 */
async function archivePayslip(payrollId, userId, userRole, options = {}) {
  const { 
    forceRegenerate = false, 
    uploadToDrive = true, 
    skipDriveOnFailure = false 
  } = options;
  
  // Generate PDF
  const { bytes, filename, slip } = await generatePayslipBytes(payrollId);
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const employeeId = slip.employee._id;
  const storageKey = `payslips/${slip.employee.employeeId}/${filename}`;
  
  // Check for existing archive
  const existingDoc = await findExistingArchive(payrollId);
  
  if (existingDoc && !forceRegenerate) {
    // Check if we need to retry Drive upload
    if (uploadToDrive && existingDoc.uploadStatus === 'drive_failed' && driveModule.isConfigured()) {
      // Will retry below
    } else if (existingDoc.uploadStatus === 'drive_uploaded' || existingDoc.uploadStatus === 'server_saved') {
      return {
        success: true,
        alreadyExists: true,
        downloadUrl: `/api/payroll/${payrollId}/download`,
        driveUrl: existingDoc.driveUrl || null,
        driveFileId: existingDoc.driveFileId || null,
        status: existingDoc.uploadStatus,
        documentId: existingDoc._id
      };
    }
  }
  
  // Determine storage provider
  const { activeProvider, driveConfigured: storageDriveConfigured } = require('./storage');
  const provider = activeProvider();
  const useDrive = uploadToDrive && driveModule.isConfigured();
  
  // 1. Store in primary storage (local or Google Drive)
  let storageResult;
  const buffer = Buffer.from(bytes);
  
  try {
    const { putObject } = require('./storage');
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
        checksum: crypto.createHash('sha256').update(bytes).digest('hex')
      }
    });
  } catch (storageError) {
    console.error('[payslipArchive] Primary storage failed:', storageError.message);
    throw new Error(`Failed to store payslip: ${storageError.message}`);
  }
  
  // 2. Create/Update MongoDB metadata
  
  await upsertDocumentMetadata({
    payrollId: slip._id,
    employeeId: slip.employee._id,
    filename,
    storageProvider: storageResult.provider,
    fileKey: storageResult.key,
    driveFileId: null,
    driveFolderId: null,
    checksum,
    fileSize: bytes.length,
    uploadStatus: 'server_saved',
    uploadedBy: userId, // system user who initiated the download
    uploaderRole: 'system',
    existingDoc: null
  });
  
  // 3. Upload to Google Drive if configured and enabled
  let driveResult = null;
  if (driveModule.isConfigured()) {
    try {
      // Update status to uploading
      await upsertDocumentMetadata({
        payrollId: slip._id,
        employeeId: slip.employee._id,
        filename,
        storageProvider: storageResult.provider,
        fileKey: storageResult.key,
        driveFileId: null,
        driveFolderId: null,
        checksum,
        fileSize: bytes.length,
        uploadStatus: 'server_saved', // mapped to 'active'
        uploadedBy: userId,
        uploaderRole: 'system',
        existingDoc: await findExistingArchive(slip._id)
      });
      
      const appProperties = {
        documentType: 'payslip',
        employeeId: slip.employee.employeeId,
        period: slip.period,
        payrollId: String(slip._id),
        generatedAt: new Date().toISOString(),
        checksum
      };
      
      driveResult = await uploadToGoogleDriveWithRetry(
        buffer, 
        filename, 
        slip.employee.employeeId, 
        slip.period, 
        slip._id,
        appProperties
      );
      
      // Update with Drive success
      await upsertDocumentMetadata({
        payrollId: slip._id,
        employeeId: slip.employee._id,
        filename,
        storageProvider: storageResult.provider,
        fileKey: storageResult.key,
        driveFileId: driveResult.driveFileId,
        driveFolderId: driveResult.driveFolderId,
        checksum,
        fileSize: bytes.length,
        uploadStatus: 'drive_uploaded',
        uploadedBy: userId,
        uploaderRole: 'system',
        existingDoc: await findExistingArchive(slip._id)
      });
      
    } catch (driveError) {
      console.error('[payslipArchive] Google Drive upload failed:', driveError.message);
      
      // Update status to failed but don't fail the whole operation
      await upsertDocumentMetadata({
        payrollId: slip._id,
        employeeId: slip.employee._id,
        filename,
        storageProvider: storageResult.provider,
        fileKey: storageResult.key,
        driveFileId: null,
        driveFolderId: null,
        checksum,
        fileSize: bytes.length,
        uploadStatus: 'drive_failed',
        uploadedBy: userId,
        uploaderRole: 'system',
        errorMessage: driveError.message,
        existingDoc: await findExistingArchive(slip._id)
      });
      if (!skipDriveOnFailure) {
        // Re-throw if we should fail on Drive error
        throw driveError;
      }
    }
  }
  
  // Log audit
  const { logAudit } = require('../utils/audit');
  await logAudit({ user: { _id: 'system', role: 'system' } }, {
    action: 'payslip.archive',
    targetType: 'Payroll',
    targetId: payrollId,
    description: `Archived payslip PDF for ${slip.employee.employeeId} ${slip.period} via ${storageResult.provider}${driveResult ? ' + Google Drive' : ''}`
  });
  
  return {
    success: true,
    downloadUrl: `/api/payroll/${payrollId}/download`,
    driveUrl: driveResult?.driveUrl || null,
    driveFileId: driveResult?.driveFileId || null,
    storageProvider: storageResult.provider,
    status: driveResult ? 'drive_uploaded' : 'server_saved',
    documentId: (await findExistingArchive(payrollId))?._id,
    alreadyExists: false
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
    driveFileId: doc.driveFileId,
    driveFolderId: doc.driveFolderId,
    storageProvider: doc.storageProvider,
    fileSize: doc.fileSize,
    checksum: doc.checksum,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    driveUploadStatus: doc.driveUploadStatus,
    uploadError: doc.uploadError,
    uploadAttempts: doc.uploadAttempts
  };
}

/**
 * Retry failed Google Drive upload
 */
async function retryDriveUpload(payrollId, userId, userRole) {
  const doc = await findExistingArchive(payrollId);
  if (!doc) throw new Error('No archive found for this payslip');
  
  if (doc.uploadStatus !== 'drive_failed' && doc.uploadStatus !== 'drive_uploading') {
    throw new Error('Upload is not in a failed state');
  }
  
  if (!driveModule.isConfigured()) {
    throw new Error('Google Drive is not configured');
  }
  
  const slip = await getPayslipWithDetails(payrollId);
  const filename = require('./payslipPdf').payslipFilename(slip.employee.employeeId, slip.period);
  const storageKey = `payslips/${slip.employee.employeeId}/${filename}`;
  
  // Get file from storage
  const { getObjectStream } = require('./storage');
  const { stream } = await getObjectStream({ provider: doc.storageProvider, key: doc.fileKey });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  // Update status to uploading
  await upsertDocumentMetadata({
    payrollId: slip._id,
    employeeId: slip.employee._id,
    filename: filename,
    storageProvider: doc.storageProvider,
    fileKey: doc.fileKey,
    driveFileId: null,
    driveFolderId: null,
    checksum: doc.checksum,
    fileSize: doc.fileSize,
    uploadStatus: 'server_saved', // mapped to 'active'
    uploadedBy: userId,
    uploaderRole: 'system',
    existingDoc: doc
  });
  
  try {
    const appProperties = {
      documentType: 'payslip',
      employeeId: slip.employee.employeeId,
      period: slip.period,
      payrollId: String(payrollId),
      generatedAt: new Date().toISOString(),
      checksum: doc.checksum,
      retryAttempt: (doc.uploadAttempts || 0) + 1
    };
    
    const driveResult = await uploadToGoogleDriveWithRetry(
      buffer, 
      filename, 
      slip.employee.employeeId, 
      slip.period, 
      payrollId,
      { documentType: 'payslip', employeeId: slip.employee.employeeId, period: slip.period, payrollId, retry: true }
    );
    
    // Update with success
    await upsertDocumentMetadata({
      payrollId,
      employeeId: slip.employee._id,
      filename,
      storageProvider: doc.storageProvider,
      fileKey: doc.fileKey,
      driveFileId: driveResult.driveFileId,
      driveFolderId: driveResult.driveFolderId,
      checksum: doc.checksum,
      fileSize: doc.fileSize,
      uploadStatus: 'server_saved', // mapped to 'active'
      uploadedBy: userId,
      uploaderRole: 'system',
      existingDoc: doc
    });
    
    return { success: true, driveUrl: driveResult.driveUrl, driveFileId: driveResult.driveFileId };
    
  } catch (error) {
    await upsertDocumentMetadata({
      payrollId,
      employeeId: slip.employee._id,
      filename: filename,
      storageProvider: doc.storageProvider,
      fileKey: doc.fileKey,
      checksum: doc.checksum,
      fileSize: doc.fileSize,
      uploadStatus: 'drive_failed', // mapped to 'missing'
      uploadedBy: userId,
      uploaderRole: 'system',
      errorMessage: error.message,
      existingDoc: doc
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

/**
 * Check if Google Drive is configured
 */
function isDriveConfigured() {
  return driveModule.isConfigured();
}

/**
 * Get existing archive document
 */
async function getArchiveDocument(payrollId) {
  return findExistingArchive(payrollId);
}

module.exports = {
  STORAGE_STATUS: {
    GENERATED: 'generated',
    DOWNLOAD_READY: 'download_ready',
    SERVER_SAVED: 'server_saved',
    DRIVE_UPLOADING: 'drive_uploading',
    DRIVE_UPLOADED: 'drive_uploaded',
    DRIVE_FAILED: 'drive_failed',
    FAILED: 'failed'
  },
  archivePayslip,
  getArchiveStatus,
  retryDriveUpload,
  getArchiveDocument,
  generatePayslipBytes,
  findExistingArchive,
  upsertDocumentMetadata,
  isDriveConfigured
};