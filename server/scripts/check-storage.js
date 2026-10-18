#!/usr/bin/env node
/* Storage & database diagnostics for the Google Drive document storage.
 *
 *   node scripts/check-storage.js             → config + connectivity only (no writes)
 *   node scripts/check-storage.js --roundtrip → also upload/download a tiny probe file
 *   node scripts/check-storage.js --large     → round-trip a >threshold probe (resumable path)
 *
 * The MongoDB check is READ-ONLY (connect + ping) and honours the existing
 * MONGODB_URI. The Drive check verifies credentials + folder access and, with
 * --roundtrip, performs REAL upload/download/delete operations inside a
 * dedicated `hrm-portal-checks` subfolder (or GOOGLE_DRIVE_TEST_FOLDER_ID).
 *
 * Exit codes: 0 = all attempted checks passed, 1 = a check failed,
 *             2 = Google Drive is not configured (nothing wrong with Mongo).
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const cfg = require('../config/env');
const drive = require('../services/googleDrive');

const CHECK_FOLDER_NAME = 'hrm-portal-checks';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function redactUri(uri) {
  return String(uri).replace(/\/\/([^@/]+)@/, '//<credentials-redacted>@');
}

function collect(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function checkMongo(log) {
  log('— MongoDB —');
  log('  URI: ' + redactUri(cfg.MONGODB_URI));
  try {
    await mongoose.connect(cfg.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const conn = mongoose.connection;
    await conn.db.admin().ping();
    log(`  OK — connected to ${conn.host}/${conn.name} (read-only ping)`);
    return true;
  } catch (e) {
    log('  FAILED — ' + e.message);
    return false;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

async function checkDrive(log) {
  log('— Google Drive —');
  log('  auth mode: ' + cfg.GOOGLE_DRIVE_AUTH_MODE);
  if (!drive.isConfigured()) {
    log('  NOT CONFIGURED — ' + drive.configurationHint());
    log('  (set GOOGLE_DRIVE_FOLDER_ID + a service-account key / OAuth trio in server/.env)');
    return { state: 'unconfigured' };
  }
  log('  folder id: ' + cfg.GOOGLE_DRIVE_FOLDER_ID);
  try {
    const folder = await drive.getFolder(cfg.GOOGLE_DRIVE_FOLDER_ID);
    log(`  OK — folder "${folder.name}" (${folder.mimeType})`);
    return { state: 'ok', folder };
  } catch (e) {
    log('  FAILED — ' + (e.message || e));
    return { state: 'failed' };
  }
}

async function roundtrip(log, { large }) {
  log(`— Round-trip (${large ? 'resumable/large' : 'small'} upload) —`);
  const sizeMb = Math.max(1, cfg.UPLOAD_RESUMABLE_THRESHOLD_MB) + 1;
  const payload = large
    ? crypto.randomBytes(sizeMb * 1024 * 1024)
    : Buffer.from('cyethack-hrm storage round-trip probe ' + new Date().toISOString());
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

  let rootId = cfg.GOOGLE_DRIVE_TEST_FOLDER_ID;
  let folder;
  let createdFolder = false;
  if (rootId) {
    folder = await drive.getFolder(rootId);
  } else {
    const children = await drive.listChildren(cfg.GOOGLE_DRIVE_FOLDER_ID);
    folder = children.find((f) => f.mimeType === FOLDER_MIME && f.name === CHECK_FOLDER_NAME);
    if (!folder) {
      folder = await drive.ensureFolder(cfg.GOOGLE_DRIVE_FOLDER_ID, CHECK_FOLDER_NAME);
      createdFolder = true;
    }
  }

  const name = `cyethack-storage-check-${Date.now()}.${large ? 'bin' : 'txt'}`;
  let fileId;
  try {
    const uploaded = await drive.uploadFile({
      name,
      buffer: payload,
      mimeType: large ? 'application/octet-stream' : 'text/plain',
      parentId: folder.id,
      appProperties: { managedBy: 'cyethack-hrm', kind: 'storage-check' },
    });
    fileId = uploaded.id;
    log(`  1) uploaded ${payload.length} bytes → ${fileId}`);

    const stream = await drive.getFileStream(fileId);
    const fetched = await collect(stream);
    if (sha(fetched) !== sha(payload)) throw new Error('downloaded bytes do not match the uploaded bytes');
    log(`  2) downloaded ${fetched.length} bytes — checksum verified ✔`);

    const meta = await drive.getFileMeta(fileId);
    if (!meta || meta.trashed) throw new Error('uploaded file is not visible to metadata reads');
    log('  3) metadata readable ✔');
    return true;
  } finally {
    if (fileId) {
      try {
        await drive.deleteFile(fileId); // our own probe file — hard delete is intended
        log('  4) probe file removed ✔');
      } catch (e) {
        log('  (probe cleanup failed: ' + e.message + ')');
      }
    }
    if (createdFolder && folder) {
      try {
        await drive.deleteFile(folder.id);
      } catch {
        /* folder may hold other probe leftovers — harmless */
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const doRoundtrip = args.includes('--roundtrip') || args.includes('--large');
  const large = args.includes('--large');
  const log = (s) => console.log(s);

  log('Cyethack HRM — storage diagnostics');
  const mongoOk = await checkMongo(log);
  const driveResult = await checkDrive(log);

  let driveOk = driveResult.state === 'ok';
  if (driveResult.state === 'ok' && doRoundtrip) {
    try {
      driveOk = await roundtrip(log, { large });
    } catch (e) {
      driveOk = false;
      log('  ROUND-TRIP FAILED — ' + (e.message || e));
    }
  }
  if (doRoundtrip && driveResult.state === 'unconfigured') {
    log('  (skipped round-trip: Drive not configured)');
  }

  log('— summary —');
  log('  mongo: ' + (mongoOk ? 'ok' : 'FAILED'));
  log('  drive: ' + (driveResult.state === 'unconfigured' ? 'not configured' : driveOk ? 'ok' : 'FAILED'));
  if (!mongoOk) return 1;
  if (driveResult.state === 'unconfigured') return 2;
  return driveOk ? 0 : 1;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { main, checkMongo, checkDrive, roundtrip };
