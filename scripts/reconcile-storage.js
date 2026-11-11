#!/usr/bin/env node
/* Reconciliation for document storage.
 *
 * Finds:
 *   - ghosts:  MongoDB records whose stored file is missing (local disk or
 *              Drive, including files sitting in the Drive trash)
 *   - orphans: Google Drive files marked as created by this app
 *              (appProperties.managedBy = 'cyethack-hrm') that no MongoDB
 *              record references
 *
 *   node scripts/reconcile-storage.js                     → read-only report
 *   node scripts/reconcile-storage.js --fix-missing       → mark ghost records uploadStatus='missing'
 *   node scripts/reconcile-storage.js --trash-orphans --yes → trash orphaned Drive files (recoverable ~30 days)
 *
 * Safety: nothing is ever hard-deleted here, orphan trashing requires BOTH
 * flags, and only files carrying this app's marker are ever touched.
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cfg = require('../config/env');
const storage = require('../services/storage');

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function modelSpecs() {
  /* eslint-disable global-require */
  return [
    { name: 'Document', model: require('../models/Document'), keyField: 'storageKey', statusField: 'uploadStatus' },
    { name: 'Certification', model: require('../models/Certification'), keyField: 'certificateFileKey', statusField: null },
  ];
  /* eslint-enable global-require */
}

async function reconcileOnce({ drive, specs, fixMissing = false, trashOrphans = false, confirmTrash = false, log = console.log }) {
  const referenced = new Set();
  const ghosts = [];

  for (const spec of specs) {
    const docs = await spec.model
      .find({ [`${spec.keyField}`]: { $exists: true, $ne: null } })
      .select(`_id ${spec.keyField} storageProvider uploadStatus`)
      .lean();
    for (const doc of docs) {
      const provider = doc.storageProvider || 'local';
      const key = doc[spec.keyField];
      const label = `${spec.name}/${String(doc._id)}`;
      if (provider === 'google-drive') {
        referenced.add(key); // still "owned" by this record even when archived
        if (doc.uploadStatus === 'deleted') continue; // archived by design
        const meta = await drive.getFileMeta(key);
        if (!meta) ghosts.push({ label, reason: 'missing in Drive' });
        else if (meta.trashed) ghosts.push({ label, reason: 'in the Drive trash' });
      } else {
        const full = path.join(storage.UPLOAD_DIR, storage.safeKey(key));
        if (doc.uploadStatus === 'deleted') continue;
        if (!fs.existsSync(full)) ghosts.push({ label, reason: 'missing on disk' });
      }
    }
  }

  let orphans = [];
  if (drive.isConfigured() && cfg.GOOGLE_DRIVE_FOLDER_ID) {
    const children = await drive.listChildren(cfg.GOOGLE_DRIVE_FOLDER_ID);
    orphans = children.filter(
      (f) => f.mimeType !== FOLDER_MIME && f.appProperties && f.appProperties.managedBy === 'cyethack-hrm' && !referenced.has(f.id),
    );
  }

  let fixed = 0;
  if (fixMissing) {
    for (const ghost of ghosts) {
      const [modelName, id] = ghost.label.split('/');
      const spec = specs.find((s) => s.name === modelName);
      if (!spec || !spec.statusField) continue;
      const res = await spec.model.updateOne({ _id: id }, { $set: { [spec.statusField]: 'missing' } });
      fixed += res.modifiedCount || 0;
      ghost.marked = 'missing';
    }
  }

  let trashed = 0;
  if (trashOrphans && confirmTrash) {
    for (const f of orphans) {
      try {
        await drive.trashFile(f.id);
        trashed += 1;
        f.trashed = true;
      } catch (e) {
        log(`  (could not trash orphan ${f.id}: ${e.message})`);
      }
    }
  }

  return { ghosts, orphans, fixed, trashed };
}

async function main() {
  const args = process.argv.slice(2);
  const fixMissing = args.includes('--fix-missing');
  const trashOrphans = args.includes('--trash-orphans');
  const confirmTrash = args.includes('--yes');
  const log = (s) => console.log(s);

  if (trashOrphans && !confirmTrash) {
    log('--trash-orphans requires --yes (it moves orphaned Drive files to the trash).');
    return 1;
  }

  await mongoose.connect(cfg.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const conn = mongoose.connection;
  log(`Reconciliation — database ${conn.host}/${conn.name}`);
  const drive = require('../services/googleDrive');
  if (!drive.isConfigured()) log('(Google Drive is not configured — only local-file ghosts are checked)');

  const { ghosts, orphans, fixed, trashed } = await reconcileOnce({
    drive,
    specs: modelSpecs(),
    fixMissing,
    trashOrphans,
    confirmTrash,
    log,
  });

  log(`\nGhosts (records without a file): ${ghosts.length}`);
  ghosts.slice(0, 50).forEach((g) => log(`  - ${g.label} — ${g.reason}${g.marked ? ' → marked missing' : ''}`));
  if (ghosts.length > 50) log(`  … and ${ghosts.length - 50} more`);

  log(`Orphans (Drive files without a record): ${orphans.length}`);
  orphans.slice(0, 50).forEach((f) => log(`  - ${f.name} (${f.id})${f.trashed ? ' → trashed' : ''}`));
  if (orphans.length > 50) log(`  … and ${orphans.length - 50} more`);

  if (fixMissing) log(`\nMarked missing: ${fixed}`);
  if (trashOrphans && confirmTrash) log(`Trashed orphans: ${trashed}`);
  if (ghosts.length && !fixMissing) log('\nRun with --fix-missing to flag ghost records.');
  if (orphans.length && !(trashOrphans && confirmTrash)) log('Run with --trash-orphans --yes to trash orphaned files.');

  await mongoose.disconnect();
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { main, reconcileOnce };
