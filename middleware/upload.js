/* Secure file-upload handling (multer).
 *
 * Files are held in MEMORY and streamed straight into the configured storage
 * provider (local disk or Google Drive) — no disk temp files for new uploads.
 * Original disk-mode files under uploads/ remain readable for old records.
 *
 * Guardrails: configurable size cap, MIME allowlist (extendable via
 * UPLOAD_ALLOWED_MIME) and a magic-byte check so a renamed executable cannot
 * be uploaded as a "PDF". Raw paths are never exposed — downloads go through
 * the controllers, which authorise every request first.
 */
'use strict';
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cfg = require('../config/env');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const BASE_ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const extraAllowed = cfg.UPLOAD_ALLOWED_MIME
  ? cfg.UPLOAD_ALLOWED_MIME.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const ALLOWED = new Set([...BASE_ALLOWED, ...extraAllowed]);

/* ---------------- content sniffing ---------------- */

/** Detect a file family from its magic bytes; null when no signature applies. */
function sniffMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const b = buffer;
  if (b.length >= 5 && b.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'application/zip'; // docx/xlsx are zip containers
  return null;
}

/** Declared MIME → the sniffed family it must actually be. */
const SNIFF_EXPECT = {
  'application/pdf': 'application/pdf',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/gif': 'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/zip',
};

/** True when the bytes plausibly match the declared type (renamed files fail). */
function bytesMatchDeclared(declared, buffer) {
  const expect = SNIFF_EXPECT[declared];
  if (!expect) return true; // no reliable signature for this type — accept declared
  return sniffMime(buffer) === expect;
}

/* ---------------- uploader factory ---------------- */

/**
 * Build a multer instance with the shared guardrails.
 * @param {{maxMb?:number, allowed?:Set<string>}} [opts]
 */
function createUploader({ maxMb = cfg.UPLOAD_MAX_MB, allowed = ALLOWED } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.max(1, maxMb) * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!allowed.has(file.mimetype)) {
        return cb(new ApiError(400, `Unsupported file type: ${file.mimetype}.`));
      }
      cb(null, true);
    },
  });
}

/** Default uploader (UPLOAD_MAX_MB, default 10 MB) for the documents register. */
const upload = createUploader();

/** Employee-document uploader — keeps the legacy 50 MB envelope + its type set. */
const employeeDocumentUpload = createUploader({
  maxMb: 50,
  allowed: new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
  ]),
});

module.exports = { upload, employeeDocumentUpload, createUploader, sniffMime, bytesMatchDeclared, ALLOWED, UPLOAD_DIR };
