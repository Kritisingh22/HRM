#!/usr/bin/env node
/* ============================================================
   check-public.js — startup guard: the committed frontend dist
   must be present before the Express server starts.

   Runs as part of `npm --prefix server start` (after check-imports).
   Exits with a clear error if server/public/index.html (or
   FRONTEND_DIST) is missing, or if index.html references /assets
   files that do not exist on disk.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = process.env.FRONTEND_DIST || path.join(ROOT, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

function fail(message) {
  console.error(`[check-public] ERROR: ${message}`);
  process.exit(1);
}

function main() {
  // 1. Guard: the frontend dist directory must exist.
  if (!fs.existsSync(PUBLIC_DIR) || !fs.statSync(PUBLIC_DIR).isDirectory()) {
    fail(
      `Frontend dist not found at ${PUBLIC_DIR}. ` +
      'Build the client locally (`npm run build:client`) and commit server/public before deploying.'
    );
  }

  // 2. Guard: index.html must be present.
  if (!fs.existsSync(INDEX_HTML)) {
    fail(`${INDEX_HTML} not found — the committed frontend build is incomplete.`);
  }

  // 3. Guard: every /assets/... reference in index.html must exist on disk.
  const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
  const assetRefs = [
    ...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
  ].map((m) => m[1]);

  const missing = [];
  for (const ref of assetRefs) {
    if (!fs.existsSync(path.join(PUBLIC_DIR, ref.slice(1)))) {
      missing.push(ref);
    }
  }
  if (missing.length) {
    fail(
      `index.html references ${missing.length} asset file(s) that are missing from ${PUBLIC_DIR}:\n  ${missing.join('\n  ')}`
    );
  }

  console.log(
    `[check-public] OK: ${PUBLIC_DIR}/index.html present (${assetRefs.length} asset reference(s) verified).`
  );
}

main();
