#!/usr/bin/env node
/* ============================================================
   sync-dist.js — rebuild server/public from a fresh client/dist.

   Runs after `npm --prefix client run build`. Replaces the old
   `cp -r client/dist/* server/public/` command, which accumulated
   stale hashed assets and source maps because it never deleted.

   Safety: aborts if client/dist/index.html is missing, so a failed
   build can never wipe the currently-served assets.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const SERVER_PUBLIC = path.join(ROOT, 'server', 'public');

function fail(message) {
  console.error(`[sync-dist] ERROR: ${message}`);
  process.exit(1);
}

function main() {
  // 1. Guard: refuse to run if the build output is missing/incomplete.
  if (!fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
    fail('client/dist/index.html not found — did the client build fail? Aborting before any deletion.');
  }

  // 2. Remove stale build outputs (never removes non-build files like
  //    favicon.ico, robots.txt, stats.html which live in client/public now).
  const assetsDir = path.join(SERVER_PUBLIC, 'assets');
  const serverIndex = path.join(SERVER_PUBLIC, 'index.html');
  if (fs.existsSync(assetsDir)) fs.rmSync(assetsDir, { recursive: true, force: true });
  if (fs.existsSync(serverIndex)) fs.rmSync(serverIndex, { force: true });

  // 3. Copy the fresh build over.
  fs.cpSync(CLIENT_DIST, SERVER_PUBLIC, { recursive: true, force: true, dereference: true });

  // 4. Never serve source maps to the browser.
  const mapFiles = [];
  function removeMaps(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        removeMaps(full);
      } else if (entry.name.endsWith('.map')) {
        fs.rmSync(full, { force: true });
        mapFiles.push(full);
      }
    }
  }
  if (fs.existsSync(assetsDir)) removeMaps(assetsDir);

  // 5. Verify every /assets/... reference in index.html exists on disk.
  const indexHtml = fs.readFileSync(serverIndex, 'utf8');
  const assetRefs = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const missing = [];
  for (const ref of assetRefs) {
    if (!fs.existsSync(path.join(SERVER_PUBLIC, ref.slice(1)))) {
      missing.push(ref);
    }
  }
  if (missing.length) {
    fail(`index.html references ${missing.length} asset file(s) that are missing from server/public:\n  ${missing.join('\n  ')}`);
  }

  // 6. Report.
  let assetCount = 0;
  if (fs.existsSync(assetsDir)) {
    for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isFile()) assetCount++;
    }
  }
  console.log(`[sync-dist] OK: ${assetCount} file(s) in server/public/assets`);
  console.log(`[sync-dist] OK: ${assetRefs.length} asset reference(s) verified in index.html`);
  if (mapFiles.length) console.log(`[sync-dist] Removed ${mapFiles.length} source-map file(s).`);
}

main();
