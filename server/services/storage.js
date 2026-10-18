/* Storage service — provider-aware object storage for document bytes.
 *
 * MongoDB only ever stores metadata; the bytes live behind this seam:
 *   - 'google-drive' : private folder in Google Drive via services/googleDrive.js
 *   - 'local'        : <cwd>/uploads on disk (legacy default, kept for existing
 *                      records and for running without any cloud credentials)
 *
 * Selection: DOCUMENT_STORAGE=local|google-drive, or automatic (Drive when it is
 * fully configured, otherwise local). Every record remembers its provider, so
 * pre-existing local files keep working after Drive is enabled — there is no
 * migration step and nothing is ever bulk-moved or bulk-deleted.
 *
 * All providers expose the same four operations:
 *   putObject({key, buffer, contentType, originalName, appProperties})
 *   getObjectStream({provider, key})      → { stream }
 *   objectExists({provider, key})         → boolean
 *   removeObject({provider, key})         → { removed, mode: 'deleted'|'trashed'|'absent' }
 *
 * Tests may install a fake Drive adapter through __test.setDriveAdapter() — this
 * exercises OUR orchestration only; live Drive behavior is covered separately by
 * tests/documents-live.test.js against the real API.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config/env');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- local helpers ---------------- */

/** Prevent path traversal: keep only basename-safe segments. */
function safeKey(fileKey) {
  return String(fileKey).replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '');
}

function filePath(fileKey) {
  return path.join(UPLOAD_DIR, safeKey(fileKey));
}

/** Safe, human-readable Drive filename derived from the storage key. */
function safeDriveName(storageKey, originalName) {
  const base = path.basename(String(storageKey || 'document'));
  let name = base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 180);
  if (!path.extname(name)) {
    const ext = path.extname(String(originalName || '')).replace(/[^A-Za-z0-9.]/g, '').slice(0, 12);
    name += ext;
  }
  return name || 'document';
}

/* ---------------- provider selection + test seam ---------------- */

let driveAdapter = null; // test-only override

function driveModule() {
  return driveAdapter || require('./googleDrive');
}

function driveConfigured() {
  try {
    return driveModule().isConfigured();
  } catch {
    return false;
  }
}

function activeProvider() {
  if (cfg.DOCUMENT_STORAGE === 'google-drive') return 'google-drive';
  if (cfg.DOCUMENT_STORAGE === 'local') return 'local';
  return driveConfigured() ? 'google-drive' : 'local';
}

const __test = {
  /** Install a fake Drive adapter (unit tests only; never used in production). */
  setDriveAdapter(fake) {
    driveAdapter = fake;
  },
  resetDriveAdapter() {
    driveAdapter = null;
  },
};

/* ---------------- operations ---------------- */

/**
 * Store a buffer and return where it landed.
 * @returns {{provider:string, key:string, driveFileId:string|null, folderId:string|null, size:number, checksum:string}}
 */
async function putObject({ key, buffer, contentType, originalName, appProperties }) {
  if (!Buffer.isBuffer(buffer)) throw new ApiError(500, 'Upload payload must be a buffer.');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const provider = activeProvider();

  if (provider === 'google-drive') {
    if (!driveConfigured()) throw new ApiError(503, 'Document storage is not configured on the server.');
    const drive = driveModule();
    const file = await drive.uploadFile({
      name: safeDriveName(key, originalName),
      buffer,
      mimeType: contentType || 'application/octet-stream',
      parentId: cfg.GOOGLE_DRIVE_FOLDER_ID,
      appProperties: { managedBy: 'cyethack-hrm', ...(appProperties || {}) },
    });
    return {
      provider,
      key: file.id,
      driveFileId: file.id,
      folderId: cfg.GOOGLE_DRIVE_FOLDER_ID,
      size: buffer.length,
      checksum,
    };
  }

  const stored = safeKey(key);
  const full = filePath(stored);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return { provider: 'local', key: stored, driveFileId: null, folderId: null, size: buffer.length, checksum };
}

/** Readable stream of the stored bytes. Missing files → 404 ApiError. */
async function getObjectStream({ provider, key }) {
  if (provider === 'google-drive') {
    if (!driveConfigured()) throw new ApiError(503, 'Document storage is not configured on the server.');
    const stream = await driveModule().getFileStream(key);
    return { stream };
  }
  const full = filePath(key);
  if (!fs.existsSync(full)) throw ApiError.notFound('File is missing on the server.');
  return { stream: fs.createReadStream(full) };
}

/** Existence check (used by reconciliation; 404s are false, other errors throw). */
async function objectExists({ provider, key }) {
  if (provider === 'google-drive') {
    if (!driveConfigured()) throw new ApiError(503, 'Document storage is not configured on the server.');
    return driveModule().fileExists(key);
  }
  return fs.existsSync(filePath(key));
}

/** Delete/trash a stored object. Never throws for an already-absent file. */
async function removeObject({ provider, key }) {
  if (provider === 'google-drive') {
    if (!driveConfigured()) throw new ApiError(503, 'Document storage is not configured on the server.');
    try {
      await driveModule().trashFile(key);
      return { removed: true, mode: 'trashed' };
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 404) return { removed: false, mode: 'absent' };
      throw e;
    }
  }
  const full = filePath(key);
  const existed = fs.existsSync(full);
  fs.rmSync(full, { force: true });
  return { removed: existed, mode: existed ? 'deleted' : 'absent' };
}

module.exports = {
  UPLOAD_DIR,
  safeKey,
  activeProvider,
  driveConfigured,
  putObject,
  getObjectStream,
  objectExists,
  removeObject,
  __test,
};
