#!/usr/bin/env node
/* One-time migration: move every file under server/uploads into Cloudflare R2.
 *
 *   node scripts/migrate-uploads-to-r2.js [--delete-local]
 *
 * Without --delete-local it only COPIES files to R2 and prints a report, so
 * you can verify before removing the local copies. With --delete-local each
 * file is removed from disk only after the R2 put succeeds and the object is
 * confirmed present in the bucket.
 *
 * Requires R2_* env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME, R2_ENDPOINT). Objects are stored under the key prefix
 * `migrated/<relative-path-from-uploads>`.
 *
 * Nothing in this repo serves /uploads directly anymore — all downloads go
 * through the authenticated document/payslip routes — so local disk is only a
 * legacy cache after this migration.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const storage = require('../services/storage');
const cfg = require('../config/env');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function main() {
  const deleteLocal = process.argv.includes('--delete-local');

  if (!storage.r2Configured()) {
    console.error('R2 is not configured (set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT).');
    console.error('Aborting: nothing to migrate.');
    process.exit(1);
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log('No server/uploads directory — nothing to migrate.');
    return 0;
  }

  const files = [...walk(UPLOAD_DIR)].filter((f) => f !== path.join(UPLOAD_DIR, '.gitkeep'));
  console.log(`Found ${files.length} file(s) under server/uploads`);
  if (files.length === 0) return 0;

  let ok = 0, failed = 0;
  for (const full of files) {
    const rel = path.relative(UPLOAD_DIR, full).split(path.sep).join('/');
    const key = `migrated/${rel}`;
    const buffer = fs.readFileSync(full);
    const contentType = (() => {
      const ext = path.extname(full).toLowerCase();
      const map = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.txt': 'text/plain' };
      return map[ext] || 'application/octet-stream';
    })();
    try {
      const put = await storage.putObject({
        key,
        buffer,
        contentType,
        originalName: path.basename(full),
        appProperties: { migratedFrom: rel, migratedAt: new Date().toISOString() },
      });
      const exists = await storage.objectExists({ provider: put.provider, key: put.key });
      if (!exists) throw new Error('post-put existence check failed');
      ok++;
      if (deleteLocal) {
        fs.rmSync(full, { force: true });
      }
      console.log(`  OK   ${rel} → ${put.provider}:${put.key} (${buffer.length} bytes)`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${rel}: ${e.message}`);
    }
  }

  console.log(`\nMigration complete: ${ok} succeeded, ${failed} failed.`);
  if (deleteLocal) {
    console.log('Local copies removed for all successful migrations.');
  } else {
    console.log('Run again with --delete-local to remove the local copies.');
  }
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
