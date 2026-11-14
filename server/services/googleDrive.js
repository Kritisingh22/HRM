/* Google Drive provider ΓÇö the ONLY module that talks to the official Drive API.
 *
 * Auth (chosen by GOOGLE_DRIVE_AUTH_MODE):
 *   - 'service_account' (default): JSON key file under server/secrets/ (gitignored)
 *     or inline JSON via GOOGLE_SERVICE_ACCOUNT_JSON. The service account can only
 *     reach files/folders that were explicitly shared with its email ΓÇö and it can
 *     upload into a My Drive folder that has been shared with it as Editor.
 *   - 'oauth': a stored refresh token acts on behalf of a real user account
 *     (files are then owned by that user). All three GOOGLE_OAUTH_* vars required.
 *
 * Privacy: sharing/permissions on Drive are NEVER modified from here ΓÇö nothing is
 * ever made public, and no Drive URL is ever sent to clients. Files are private by
 * default and reach users only through authenticated backend endpoints.
 *
 * Reliability: transient failures (429/5xx/network) are retried with exponential
 * backoff; every error is mapped to a safe ApiError (no credentials, no raw
 * Google payloads are ever surfaced).
 */
'use strict';

const fs = require('fs');
const { Readable } = require('stream');
const cfg = require('../config/env');
const ApiError = require('../utils/ApiError');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED']);
const MAX_ATTEMPTS = 3;

let client = null; // cached google.drive client (lazy)

/* ---------------- configuration ---------------- */

function hasServiceAccount() {
  if (cfg.GOOGLE_SERVICE_ACCOUNT_JSON) return true;
  try {
    return fs.existsSync(cfg.GOOGLE_SERVICE_ACCOUNT_FILE);
  } catch {
    return false;
  }
}

function hasOAuth() {
  return Boolean(cfg.GOOGLE_OAUTH_CLIENT_ID && cfg.GOOGLE_OAUTH_CLIENT_SECRET && cfg.GOOGLE_OAUTH_REFRESH_TOKEN);
}

/** True when a folder AND a usable credential source are configured. */
function isConfigured() {
  if (!cfg.GOOGLE_DRIVE_FOLDER_ID) return false;
  return cfg.GOOGLE_DRIVE_AUTH_MODE === 'oauth' ? hasOAuth() : hasServiceAccount();
}

/** Human-readable reason when isConfigured() is false (never includes secrets). */
function configurationHint() {
  if (!cfg.GOOGLE_DRIVE_FOLDER_ID) return 'GOOGLE_DRIVE_FOLDER_ID is not set.';
  if (cfg.GOOGLE_DRIVE_AUTH_MODE === 'oauth') {
    return 'OAuth mode requires GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN.';
  }
  return `Service-account key not found (looked for ${cfg.GOOGLE_SERVICE_ACCOUNT_FILE}).`;
}

function loadServiceAccountKey() {
  try {
    const raw = cfg.GOOGLE_SERVICE_ACCOUNT_JSON
      ? cfg.GOOGLE_SERVICE_ACCOUNT_JSON
      : fs.readFileSync(cfg.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8');
    const key = JSON.parse(raw);
    if (!key.client_email || !key.private_key) {
      throw new Error('missing client_email/private_key');
    }
    return key;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[drive] service-account key could not be loaded:', e.message);
    throw new ApiError(503, 'Document storage is not configured correctly on the server.');
  }
}

/** Lazy singleton Drive client. Throws ApiError(503) when misconfigured. */
function getDrive() {
  if (client) return client;
  if (!isConfigured()) throw new ApiError(503, 'Document storage is not configured on the server.');
  // eslint-disable-next-line global-require
  const { google } = require('googleapis');
  let auth;
  if (cfg.GOOGLE_DRIVE_AUTH_MODE === 'oauth') {
    auth = new google.auth.OAuth2(cfg.GOOGLE_OAUTH_CLIENT_ID, cfg.GOOGLE_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: cfg.GOOGLE_OAUTH_REFRESH_TOKEN });
  } else {
    auth = new google.auth.GoogleAuth({ credentials: loadServiceAccountKey(), scopes: [DRIVE_SCOPE] });
  }
  client = google.drive({ version: 'v3', auth });
  return client;
}

/** Test seam: forget the cached client (used by scripts/tests after env changes). */
function resetClient() {
  client = null;
}

/* ---------------- error mapping + retry ---------------- */

function driveStatus(e) {
  if (typeof e?.code === 'number') return e.code;
  if (typeof e?.response?.status === 'number') return e.response.status;
  return null;
}

function driveReason(e) {
  const errs = e?.errors || e?.response?.data?.error?.errors;
  if (Array.isArray(errs) && errs[0]?.reason) return errs[0].reason;
  return null;
}

/** Safe, actionable ApiError ΓÇö never leaks Google payloads or credentials. */
function mapDriveError(e, context = 'request') {
  if (e instanceof ApiError) return e;
  const status = driveStatus(e);
  const reason = driveReason(e);
  if (status === 404 || reason === 'notFound') return ApiError.notFound('The file was not found in storage.');
  if (reason === 'storageQuotaExceeded') return new ApiError(507, 'Document storage has no free space left.');
  if (status === 403 || reason === 'forbidden' || reason === 'insufficientFilePermissions' || reason === 'appNotAuthorizedToChild') {
    return new ApiError(502, 'Document storage refused the request ΓÇö verify the folder is shared with the storage account.');
  }
  if (status === 401) return new ApiError(502, 'Document storage authentication failed. Check the server credentials.');
  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return new ApiError(503, 'Document storage is rate-limiting requests. Please try again shortly.');
  }
  if (status >= 500 && status < 600) return new ApiError(502, 'Document storage is temporarily unavailable. Please try again.');
  if (!status && RETRYABLE_CODES.has(e?.code)) return new ApiError(502, 'Document storage could not be reached. Please try again.');
  // eslint-disable-next-line no-console
  console.error(`[drive] ${context} failed:`, e?.message || e);
  return new ApiError(502, 'The document storage request failed. Please try again.');
}

function isRetryable(e) {
  if (e instanceof ApiError) return false;
  const status = driveStatus(e);
  if (status && RETRYABLE_HTTP.has(status)) return true;
  return RETRYABLE_CODES.has(e?.code);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run a Drive call with bounded exponential backoff on transient failures. */
async function withRetry(fn, context) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === MAX_ATTEMPTS || !isRetryable(e)) throw mapDriveError(e, context);
      await sleep(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
    }
  }
  throw mapDriveError(last, context);
}

/* ---------------- helpers ---------------- */

function escapeQueryValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/* ---------------- file operations ---------------- */

/**
 * Upload a buffer into a folder. Above the configured threshold the official
 * resumable protocol is used (the SDK switches automatically for stream bodies).
 * @returns {{id:string,name:string,size:number,mimeType:string,md5Checksum?:string}}
 */
async function uploadFile({ name, buffer, mimeType, parentId, appProperties }) {
  if (!Buffer.isBuffer(buffer)) throw new ApiError(500, 'Upload payload must be a buffer.');
  const resumable = buffer.length >= cfg.UPLOAD_RESUMABLE_THRESHOLD_MB * 1024 * 1024;
  return withRetry(async () => {
    const drive = getDrive();
    const body = resumable ? Readable.from(buffer) : buffer;
    const res = await drive.files.create(
      {
        requestBody: {
          name,
          parents: [parentId],
          ...(appProperties ? { appProperties } : {}),
        },
        media: { mimeType: mimeType || 'application/octet-stream', body },
        fields: 'id,name,size,mimeType,md5Checksum',
        supportsAllDrives: true,
      },
      resumable ? { timeout: 120000 } : undefined,
    );
    return res.data;
  }, 'upload');
}

/** Readable stream of the file bytes (downloads are proxied ΓÇö never redirected). */
async function getFileStream(fileId) {
  return withRetry(async () => {
    const drive = getDrive();
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );
    return res.data;
  }, 'download');
}

/** File metadata (id/name/mime/size/trashed/...), or null when not found. */
async function getFileMeta(fileId) {
  try {
    return await withRetry(async () => {
      const drive = getDrive();
      const res = await drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,md5Checksum,trashed,parents,driveId',
        supportsAllDrives: true,
      });
      return res.data;
    }, 'stat');
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 404) return null;
    throw e;
  }
}

/** True when the file exists and is not in the trash. Other failures throw. */
async function fileExists(fileId) {
  const meta = await getFileMeta(fileId);
  return Boolean(meta && !meta.trashed);
}

/** Move a file to the Drive trash (recoverable ~30 days). */
async function trashFile(fileId) {
  return withRetry(async () => {
    const drive = getDrive();
    const res = await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      fields: 'id,trashed',
      supportsAllDrives: true,
    });
    return res.data;
  }, 'trash');
}

/** Permanent delete ΓÇö used ONLY by test/cleanup scripts on files they created. */
async function deleteFile(fileId) {
  return withRetry(async () => {
    const drive = getDrive();
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return { id: fileId, deleted: true };
  }, 'delete');
}

/** Children of a folder (paginated, excludes trashed items). */
async function listChildren(folderId) {
  const out = [];
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await withRetry(async () => {
      const drive = getDrive();
      return drive.files.list({
        q: `'${escapeQueryValue(folderId)}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,size,md5Checksum,appProperties,createdTime)',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
      });
    }, 'list');
    out.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

/** Folder metadata; throws a clear config error when the ID is not a folder. */
async function getFolder(folderId) {
  const meta = await getFileMeta(folderId);
  if (!meta) throw new ApiError(404, 'Configured storage folder was not found. Check GOOGLE_DRIVE_FOLDER_ID.');
  if (meta.mimeType !== FOLDER_MIME) {
    throw new ApiError(400, 'Configured storage location is not a folder. Check GOOGLE_DRIVE_FOLDER_ID.');
  }
  return meta;
}

/** Find (or create) a subfolder by name ΓÇö used by the round-trip check + live tests. */
async function ensureFolder(parentId, name) {
  const children = await listChildren(parentId);
  const existing = children.find((f) => f.mimeType === FOLDER_MIME && f.name === name);
  if (existing) return existing;
  return withRetry(async () => {
    const drive = getDrive();
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
        appProperties: { managedBy: 'cyethack-hrm', kind: 'folder' },
      },
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });
    return res.data;
  }, 'createFolder');
}

module.exports = {
  isConfigured,
  configurationHint,
  hasServiceAccount,
  hasOAuth,
  resetClient,
  uploadFile,
  getFileStream,
  getFileMeta,
  fileExists,
  trashFile,
  deleteFile,
  listChildren,
  getFolder,
  ensureFolder,
  // Exposed for unit tests only (retry/backoff + error mapping).
  __test: { withRetry, mapDriveError },
};
