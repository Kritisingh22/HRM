'use strict';
/* ============================================================
   Import check — requires every server module under routes,
   controllers, services, and models to fail fast if any import
   cannot be resolved. Runs as part of the build step so missing
   modules are caught before deployment.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['routes', 'controllers', 'services', 'models'];

let failed = false;
let checked = 0;

for (const dir of DIRS) {
  const dirPath = path.join(ROOT, dir);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // Skip files that don't export anything (standalone scripts, not modules)
      if (!content.includes('module.exports')) continue;
      require(filePath);
      checked++;
    } catch (err) {
      failed = true;
      console.error(`[IMPORT CHECK FAILED] ${filePath}`);
      console.error(`  ${err.message}`);
    }
  }
}

if (failed) {
  console.error(`\nImport check failed: module(s) could not be loaded.`);
  process.exit(1);
}

console.log(`Import check OK: ${checked} module(s) loaded successfully.`);
process.exit(0);
