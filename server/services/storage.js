/* Storage service — local filesystem fallback when no object-storage
 * provider is configured. Files are stored under <cwd>/uploads and
 * served back via the Express static middleware in app.js.
 *
 * If you later wire a real provider (S3, GCS, Azure Blob), replace the
 * implementations of uploadToStorage / getSignedUrl / deleteFromStorage
 * here — the rest of the codebase is unchanged. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config/env');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function safeKey(fileKey) {
  // Prevent path traversal: keep only basename-safe segments
  return String(fileKey).replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '');
}

function filePath(fileKey) {
  return path.join(UPLOAD_DIR, safeKey(fileKey));
}

/**
 * Upload a buffer to storage.
 * @param {string} fileKey
 * @param {Buffer} buffer
 * @param {string} [_contentType]
 */
async function uploadToStorage(fileKey, buffer, _contentType) {
  const full = filePath(fileKey);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return { key: safeKey(fileKey), bytes: buffer.length };
}

/**
 * Get a URL to retrieve a stored file. Local mode returns a relative path
 * that the Express static middleware serves at /uploads.
 * @param {string} fileKey
 * @param {number} [_expiresInSeconds]
 */
async function getSignedUrl(fileKey, _expiresInSeconds) {
  return `/uploads/${safeKey(fileKey)}`;
}

/**
 * Delete a stored file (no-op if it does not exist).
 * @param {string} fileKey
 */
async function deleteFromStorage(fileKey) {
  const full = filePath(fileKey);
  fs.rm(full, { force: true });
}

module.exports = { uploadToStorage, getSignedUrl, deleteFromStorage };