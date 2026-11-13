'use strict';
/* Script to find broken route controllers — every ctrl.<name> used in
   server/routes/*.js must be exported by the corresponding controller.
   Outputs mismatches and exits with code 1 if any are found. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const ROUTES_DIR = path.join(ROOT, 'server', 'routes');
const CONTROLLERS_DIR = path.join(ROOT, 'server', 'controllers');

console.log('=== Checking route controller references ===\n');

// 1. Load all controller exports
const controllerExports = {};
const controllerFiles = fs.readdirSync(CONTROLLERS_DIR).filter(f => f.endsWith('.js'));

for (const file of controllerFiles) {
  const filePath = path.join(CONTROLLERS_DIR, file);
  try {
    delete require.cache[filePath];
    const ctrl = require(filePath);
    const name = file.replace('.js', '');
    controllerExports[name] = ctrl;
  } catch (e) {
    // console.log(`  Failed to load ${file}: ${e.message}`);
  }
}

// 2. Check all route files
let hasMismatches = false;

const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));

for (const file of routeFiles) {
  const filePath = path.join(ROUTES_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const matches = content.match(/ctrl\.(\w+)/g) || [];

  for (const match of matches) {
    const method = match.replace('ctrl.', '');
    if (!controllerExports[method]) {
      console.error(`[MISMATCH] ${file}: ${match} — controller not found or missing export`);
      hasMismatches = true;
    } else if (typeof controllerExports[method] !== 'function') {
      console.error(`[MISMATCH] ${file}: ${match} — not a function (type: ${typeof controllerExports[method]})`);
      hasMismatches = true;
    }
  }
}

console.log(`\nChecked ${routeFiles.length} route files, ${controllerFiles.length} controller files`);
if (hasMismatches) {
  console.error('\n❌ Mismatches found! Fix them before starting the server.');
  process.exit(1);
} else {
  console.log('✅ All route controller references are valid!');
  process.exit(0);
}