/* Route callback validation script.
 * Checks that every router.METHOD() callback in route files
 * is a defined function in its corresponding controller.
 * Usage: node scripts/check-routes.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'routes');
const CONTROLLERS_DIR = path.join(ROOT, 'controllers');

// CommonJS require pattern: const ctrl = require('../controllers/ControllerName')
const REQUIRE_PATTERN = /const ctrl = require\('\.\.\/controllers\/([^']+)'\)/;

// Matches router.METHOD('/path', ctrl.METHOD) or router.METHOD('/path', mw, ctrl.METHOD)
const ROUTE_PATTERN = /router\.(get|post|put|patch|delete)\(['"][^'"]*['"]\s*(?:,\s*[^,]+)*?\s*,\s*ctrl\.[a-zA-Z_$][0-9a-zA-Z_$]*/g;

const routeFiles = fs.readdirSync(ROUTES_DIR)
  .filter(f => f.endsWith('.js'))
  .sort();

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const issues = [];

function extractCtrlMethods(content) {
  const methods = [];
  let match;
  while ((match = ROUTE_PATTERN.exec(content)) !== null) {
    const fullMatch = match[0];
    // Extract the ctrl.METHOD part
    const methodMatch = fullMatch.match(/ctrl\.([a-zA-Z_$][0-9a-zA-Z$]*)/);
    if (methodMatch) {
      methods.push(methodMatch[1]);
    }
  }
  return methods;
}

for (const routeFile of routeFiles) {
  const filePath = path.join(ROUTES_DIR, routeFile);
  const content = fs.readFileSync(filePath, 'utf8');

  // Find the require pattern for the controller
  const requireMatch = content.match(REQUIRE_PATTERN);
  const ctrlPath = requireMatch ? requireMatch[1] : null;

  // Skip routes that don't use a controller (inline callbacks)
  if (!ctrlPath) {
    // This route file uses inline callbacks, skip validation
    // but still count the route method references that do use ctrl.method
    const methods = extractCtrlMethods(content);
    totalChecks += methods.length; // count 0 since no ctrl pattern
    continue;
  }

  const methods = extractCtrlMethods(content);
  totalChecks += methods.length;

  // Require the controller and check each method
  const controllerPath = path.join(CONTROLLERS_DIR, ctrlPath);
  let controller;
  try {
    controller = require(controllerPath);
  } catch (e) {
    issues.push({
      file: routeFile,
      route: `require('${ctrlPath}')`,
      controller: ctrlPath,
      issue: `Failed to require controller: ${e.message}`
    });
    failedChecks += methods.length;
    continue;
  }

  for (const method of methods) {
    totalChecks++;
    if (typeof controller[method] === 'function') {
      passedChecks++;
    } else {
      failedChecks++;
      issues.push({
        file: routeFile,
        route: `router.${method.includes('get') ? 'get' : '?'}('/...', ctrl.${method})`,
        controller: ctrlPath,
        exportedMethod: method,
        issue: `Controller ${ctrlPath} does not export '${method}' as a function. ` +
               `Exported methods: ${Object.keys(controller).join(', ')}`
      });
    }
  }
}

console.log('=== ROUTE CALLBACK VALIDATION ===\n');
console.log(`Total route method references checked: ${totalChecks}`);
console.log(`Passed: ${passedChecks}`);
console.log(`Failed: ${failedChecks}\n`);

if (failedChecks === 0) {
  console.log('All route callbacks are properly defined!\n');
} else {
  console.log(`=== ISSUES FOUND: ${failedChecks} ===\n`);
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. File: ${issue.file}`);
    if (issue.route) console.log(`   Route: ${issue.route}`);
    if (issue.controller) console.log(`   Controller: ${issue.controller}`);
    if (issue.exportedMethod) console.log(`   Method: ${issue.exportedMethod}`);
    console.log(`   Issue: ${issue.issue}\n`);
  });
}

// Exit with error code if there are issues
if (failedChecks > 0) {
  console.error(`\nRoute callback validation failed: ${failedChecks} issue(s).`);
  process.exit(1);
} else {
  console.log('\nRoute callback validation passed.');
  process.exit(0);
}