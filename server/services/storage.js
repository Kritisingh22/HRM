/* Storage service — provider-aware object storage for document bytes.
 *
 * MongoDB only ever stores metadata; the bytes live behind this seam:
 *   - 'local'         : <cwd>/uploads on disk (dev / tests — never served directly;
 *                        all downloads stream through the authenticated controllers)
 *   - 'google-drive'  : private Google Drive folder via services/googleDrive.js
 *   - 'cloudflare-r2' : private Cloudflare R2 bucket via services/r2Storage.js
 *
 * Selection: DOCUMENT_STORAGE=local|google-drive|cloudflare-r2, or automatic
 * (R2 when fully configured, else Google Drive when fully configured, else
 * local disk). Every record remembers its provider, so pre-existing files keep
 * working when the provider changes — there is no bulk migration step here;
 * see scripts/migrate-uploads-to-r2.js for moving local uploads into R2.
 *
 * All providers expose the same four operations:
 *   putObject({key, buffer, contentType, originalName, appProperties})
 *   getObjectStream({provider, key})      → { stream }
 *   objectExists({provider, key})         → boolean
 *   removeObject({provider, key})         → { removed, mode }
 *
 * Downloads are served through short-lived signed URLs (R2) or by streaming
 * through this controller (local / Drive) — no permanent or public links are
 * ever exposed, and raw paths are never sent to clients.
 *
 * Tests may install a fake Drive adapter through __test.setDriveAdapter() —
 * this exercises OUR orchestration only; live Drive behavior is covered
 * separately by tests/documents-live.test.js against the real API.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config/env');
const ApiError = require('../utils/ApiError');
const r2 = require('./r2Storage');

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

function r2Configured() {
  return r2.r2Configured();
}

function activeProvider() {
  if (cfg.DOCUMENT_STORAGE === 'google-drive') return 'google-drive';
  if (cfg.DOCUMENT_STORAGE === 'cloudflare-r2') return 'cloudflare-r2';
  if (cfg.DOCUMENT_STORAGE === 'local') return 'local';
  if (r2Configured()) return 'cloudflare-r2';
  if (driveConfigured()) return 'google-drive';
  return 'local';
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
    return { provider, key: file.id, driveFileId: file.id, folderId: cfg.GOOGLE_DRIVE_FOLDER_ID, size: buffer.length, checksum };
  }

  if (provider === 'cloudflare-r2') {
    return r2.putObject({ key, buffer, contentType, originalName, appProperties });
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
    return { stream: await driveModule().getFileStream(key) };
  }
  if (provider === 'cloudflare-r2') {
    return r2.getObjectStream({ provider, key });
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
  if (provider === 'cloudflare-r2') {
    return r2.objectExists({ provider, key });
  }
  return fs.existsSync(filePath(key));
}

/** Delete/trash a stored object. Never throws for an already-absent file. */
async function removeObject({ provider, key }) {
  if (provider === 'google-drive') {
    if (!driveConfigured()) return { removed: false, mode: 'absent' };
    try {
      await driveModule().trashFile(key);
      return { removed: true, mode: 'trashed' };
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 404) return { removed: false, mode: 'absent' };
      throw e;
    }
  }
  if (provider === 'cloudflare-r2') {
    return r2.removeObject({ provider, key });
  }
  const full = filePath(key);
  const existed = fs.existsSync(full);
  fs.rmSync(full, { force: true });
  return { removed: existed, mode: existed ? 'deleted' : 'absent' };
}

/** Generate a short-lived signed URL for authorized download/preview (R2 only). */
async function getSignedDownloadUrl({ key, expiresIn }) {
  return r2.getSignedDownloadUrl({ key, expiresIn });
}

module.exports = {
  UPLOAD_DIR,
  safeKey,
  activeProvider,
  driveConfigured,
  r2Configured,
  putObject,
  getObjectStream,
  objectExists,
  removeObject,
  getSignedDownloadUrl,
  __test,
};
