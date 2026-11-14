'use strict';
// Better script: maps each route file to its controller and checks
// that every ctrl.<name> used in the route file is exported by that specific controller.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const ROUTES_DIR = path.join(ROOT, 'server', 'routes');
const CONTROLLERS_DIR = path.join(ROOT, 'server', 'controllers');

console.log('=== Checking route -> controller method mapping ===\n');

// 1. For each route file, extract ctrl.<name> references and which controller it uses
const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));

for (const file of routeFiles) {
  const filePath = path.join(ROUTES_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Determine the controller name from the require statement
  // Match patterns: require('../controllers/foo'), require('./controllers/foo'), etc.
  const requireMatch = content.match(/require\s*\(\s*['\"].\/([^/'"]+\/[\w]+)['\"]\s*\)/);
  // Also try ../controllers/ pattern
  const requireMatch2 = content.match(/require\s*\(\s*['\"]\.\.\/controllers\/([\w]+)['\"]\s*\)/);
  let ctrlName = null;

  if (requireMatch2) {
    ctrlName = requireMatch2[1];
  } else if (requireMatch) {
    ctrlName = requireMatch[1].replace(/\//, '');
  }

  // Extract all ctrl.xxx method names
  const matches = content.match(/ctrl\.(\w+)/g) || [];

  if (matches.length === 0) {
    console.log(`[OK] ${file}: no ctrl. references (ctrlName: ${ctrlName})`);
    continue;
  }

  // Load the specific controller
  const ctrlPath = path.join(CONTROLLERS_DIR, ctrlName + '.js');
  let ctrl;
  try {
    delete require.cache[ctrlPath];
    ctrl = require(ctrlPath);
  } catch (e) {
    console.error(`[ERROR] ${file}: failed to load controller ${ctrlPath}: ${e.message}`);
    continue;
  }

  // Check each method
  let hasMismatches = false;
  for (const match of matches) {
    const method = match.replace('ctrl.', '');
    if (ctrl[method] == null) {
      console.error(`[MISMATCH] ${file} -> ${ctrlName}.${method} — controller does not export ${method}`);
      hasMismatches = true;
    } else if (typeof ctrl[method] !== 'function') {
      console.error(`[MISMATCH] ${file} -> ${ctrlName}.${method} — not a function (type: ${typeof ctrl[method]})`);
      hasMismatches = true;
    }
  }

  if (!hasMismatches) {
    console.log(`[OK] ${file} -> ${ctrlName}: all ${matches.length} methods exported as functions`);
  }
}

console.log(`\nDone checking ${routeFiles.length} route files against their controllers`);