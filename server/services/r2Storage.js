/* Cloudflare R2 storage service — S3-compatible object storage for document bytes.

   MongoDB only ever stores metadata; the bytes live in R2. This module exposes
   the same four operations the rest of the app expects:

     putObject({key, buffer, contentType, originalName, appProperties})
       → { provider: 'cloudflare-r2', key, size, checksum, url }
     getObjectStream({provider, key}) → { stream }
     objectExists({provider, key}) → boolean
     removeObject({provider, key}) → { removed, mode }

   Downloads use short-lived signed URLs (R2_SIGNED_URL_EXPIRY seconds, default 300)
   so confidential HR documents are never publicly accessible and no permanent
   links are ever sent to clients.

   Environment variables (backend only — never exposed to React):
     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
     R2_BUCKET_NAME, R2_ENDPOINT, R2_REGION, R2_SIGNED_URL_EXPIRY
*/
'use strict';

const crypto = require('crypto');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const cfg = require('../config/env');
const ApiError = require('../utils/ApiError');

/* ---------------- client (lazy singleton) ---------------- */

let s3Client = null;

function r2Configured() {
  return Boolean(
    cfg.R2_ACCOUNT_ID &&
      cfg.R2_ACCESS_KEY_ID &&
      cfg.R2_SECRET_ACCESS_KEY &&
      cfg.R2_BUCKET_NAME &&
      cfg.R2_ENDPOINT,
  );
}

function client() {
  if (!s3Client) {
    if (!r2Configured()) {
      throw new ApiError(
        503,
        'Document storage is not configured on the server.',
      );
    }
    s3Client = new S3Client({
      endpoint: cfg.R2_ENDPOINT,
      region: cfg.R2_REGION || 'auto',
      credentials: {
        accessKeyId: cfg.R2_ACCESS_KEY_ID,
        secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      },
      // Force path-style addressing for R2 compatibility.
      s3ForcePathStyle: true,
    });
  }
  return s3Client;
}

/* ---------------- helpers ---------------- */

/** Prevent path traversal: keep only basename-safe segments. */
function safeKey(fileKey) {
  return String(fileKey).replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '');
}

/** SHA-256 of a buffer. */
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/* ---------------- operations ---------------- */

/**
 * Store a buffer in R2 and return where it landed.
 * @returns {{provider:string, key:string, size:number, checksum:string, url:string|null}}
 */
async function putObject({ key, buffer, contentType, originalName, appProperties }) {
  if (!Buffer.isBuffer(buffer)) throw new ApiError(500, 'Upload payload must be a buffer.');
  if (!r2Configured()) throw new ApiError(503, 'Document storage is not configured on the server.');

  const checksum = sha256(buffer);
  const safe = safeKey(key);

  await client().send(
    new PutObjectCommand({
      Bucket: cfg.R2_BUCKET_NAME,
      Key: safe,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      Metadata: {
        originalname: String(originalName || ''),
        ...(appProperties ? Object.fromEntries(Object.entries(appProperties).map(([k, v]) => [k, String(v)])) : {}),
      },
    }),
  );

  return {
    provider: 'cloudflare-r2',
    key: safe,
    size: buffer.length,
    checksum,
    url: null, // R2 objects are private; clients get signed URLs on demand
  };
}

/** Readable stream of the stored bytes. Missing files → 404 ApiError. */
async function getObjectStream({ provider, key }) {
  if (provider !== 'cloudflare-r2') throw new ApiError(400, 'Unsupported storage provider.');
  if (!r2Configured()) throw new ApiError(503, 'Document storage is not configured on the server.');

  const safe = safeKey(key);

  // Verify existence first so we can return a clean 404.
  try {
    await client().send(
      new HeadObjectCommand({ Bucket: cfg.R2_BUCKET_NAME, Key: safe }),
    );
  } catch (e) {
    if (e && e.name === 'NotFound') throw ApiError.notFound('File is missing in storage.');
    throw e;
  }

  const res = await client().send(
    new GetObjectCommand({ Bucket: cfg.R2_BUCKET_NAME, Key: safe }),
  );
  return { stream: res.Body };
}

/** Existence check (used by reconciliation; 404s are false, other errors throw). */
async function objectExists({ provider, key }) {
  if (provider !== 'cloudflare-r2') return false;
  if (!r2Configured()) return false;
  try {
    await client().send(
      new HeadObjectCommand({ Bucket: cfg.R2_BUCKET_NAME, Key: safeKey(key) }),
    );
    return true;
  } catch (e) {
    if (e && e.name === 'NotFound') return false;
    throw e;
  }
}

/** Delete an R2 object. Never throws for an already-absent file. */
async function removeObject({ provider, key }) {
  if (provider !== 'cloudflare-r2') return { removed: false, mode: 'absent' };
  if (!r2Configured()) return { removed: false, mode: 'absent' };

  try {
    await client().send(
      new DeleteObjectCommand({ Bucket: cfg.R2_BUCKET_NAME, Key: safeKey(key) }),
    );
    return { removed: true, mode: 'deleted' };
  } catch (e) {
    if (e && e.name === 'NotFound') return { removed: false, mode: 'absent' };
    throw e;
  }
}

/** Generate a short-lived signed URL for authorized download/preview. */
async function getSignedDownloadUrl({ key, expiresIn }) {
  if (!r2Configured()) throw new ApiError(503, 'Document storage is not configured on the server.');
  const safe = safeKey(key);
  const command = new GetObjectCommand({
    Bucket: cfg.R2_BUCKET_NAME,
    Key: safe,
    ResponseContentDisposition: 'attachment',
  });
  const expiry = expiresIn || cfg.R2_SIGNED_URL_EXPIRY || 300;
  return getSignedUrl(client(), command, { expiresIn: expiry });
}

module.exports = {
  r2Configured,
  putObject,
  getObjectStream,
  objectExists,
  removeObject,
  getSignedDownloadUrl,
  safeKey,
};