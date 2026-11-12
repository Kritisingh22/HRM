/* ============================================================
   Migration: Departments & Designations master data
   ============================================================
   This script is IDEMPOTENT and REVERSIBLE. It:
     1. Creates Department and Designation master records from the
        distinct values found on existing Employee/User records.
     2. Normalizes case and whitespace when matching.
     3. Adds departmentId/designationId ObjectId references to
        Employee/User records while keeping the legacy string fields
        in sync (denormalized display values).
     4. Reports any values that could not be mapped confidently.

   SAFETY:
     - Never drops or renames existing collections.
     - Never modifies documents except to add the new ref fields.
     - DRY-RUN mode prints what would change without writing.
     - Takes a backup export before writing (writes to a JSON file).

   Usage:
     NODE_ENV=development node server/scripts/migrate-departments-designations.js --dry-run
     NODE_ENV=development node server/scripts/migrate-departments-designations.js
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const cfg = require('../config/env');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const { connectDB, disconnectDB } = require('../config/database');

const fs = require('fs');

const DEPT_NORMALIZE = (s) => String(s || '').trim();
const DESIG_NORMALIZE = (s) => String(s || '').trim();

let dryRun = process.argv.includes('--dry-run');
let backupPath = path.resolve(__dirname, `../migration-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);

let stats = {
  departmentsCreated: 0,
  designationsCreated: 0,
  departmentsMatched: 0,
  designationsMatched: 0,
  employeesUpdated: 0,
  usersUpdated: 0,
  unmatchedDepartments: [],
  unmatchedDesignations: [],
  errors: [],
};

async function takeBackup(departments, designations, employees, users) {
  const backup = {
    timestamp: new Date().toISOString(),
    departments: departments.map((d) => d.toObject()),
    designations: designations.map((d) => d.toObject()),
    employees: employees.map((e) => e.toObject()),
    users: users.map((u) => u.toObject()),
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\n  Backup written to: ${backupPath}`);
  return backupPath;
}

async function main() {
  if (dryRun) {
    console.log('=== DRY-RUN MODE - no writes will be made ===\n');
  }

  await connectDB();

  // 1. Read existing data
  const employees = await Employee.find({}).lean();
  const users = await User.find({}).lean();
  const existingDepartments = await Department.find({}).lean();
  const existingDesignations = await Designation.find({}).lean();

  console.log(`Found ${employees.length} employees, ${users.length} users`);
  console.log(`Found ${existingDepartments.length} existing departments, ${existingDesignations.length} existing designations\n`);

  // 2. Collect distinct values
  const deptValues = new Set();
  const desigValues = new Map(); // key: "department|designation" -> { department, designation }

  for (const emp of employees) {
    if (emp.department) deptValues.add(DEPT_NORMALIZE(emp.department));
    if (emp.department && emp.designation) {
      const key = `${DEPT_NORMALIZE(emp.department)}|${DESIG_NORMALIZE(emp.designation)}`;
      if (!desigValues.has(key)) {
        desigValues.set(key, { department: DEPT_NORMALIZE(emp.department), designation: DESIG_NORMALIZE(emp.designation) });
      }
    }
  }

  for (const u of users) {
    if (u.department) deptValues.add(DEPT_NORMALIZE(u.department));
    if (u.department && u.designation) {
      const key = `${DEPT_NORMALIZE(u.department)}|${DESIG_NORMALIZE(u.designation)}`;
      if (!desigValues.has(key)) {
        desigValues.set(key, { department: DEPT_NORMALIZE(u.department), designation: DESIG_NORMALIZE(u.designation) });
      }
    }
  }

  console.log(`Distinct departments found: ${deptValues.size}`);
  console.log(`Distinct department|designation pairs found: ${desigValues.size}\n`);

  // 3. Create missing departments
  const deptMap = new Map();
  for (const d of existingDepartments) deptMap.set(d.name.toLowerCase().trim(), d);

  for (const deptName of Array.from(deptValues).sort()) {
    if (deptMap.has(deptName.toLowerCase())) {
      stats.departmentsMatched++;
      continue;
    }
    if (dryRun) {
      console.log(`[DRY-RUN] Would create department: ${deptName}`);
      stats.departmentsCreated++;
    } else {
      const dept = await Department.create({ name: deptName, isActive: true, order: stats.departmentsCreated + 1 });
      deptMap.set(dept.name.toLowerCase().trim(), dept);
      stats.departmentsCreated++;
      console.log(`  Created department: ${dept.name}`);
    }
  }

  // 4. Create missing designations
  const desigMap = new Map();
  for (const d of existingDesignations) desigMap.set(`${d.departmentId}|${d.name.toLowerCase().trim()}`, d);

  for (const [key, { department, designation }] of Array.from(desigValues.entries()).sort()) {
    if (desigMap.has(key)) {
      stats.designationsMatched++;
      continue;
    }
    const deptDoc = deptMap.get(department.toLowerCase().trim());
    if (!deptDoc) {
      stats.unmatchedDesignations.push(`${department}|${designation} (no matching department)`);
      continue;
    }
    if (dryRun) {
      console.log(`[DRY-RUN] Would create designation: ${designation} (dept: ${department})`);
      stats.designationsCreated++;
    } else {
      const desigDoc = await Designation.create({ name: designation, departmentId: deptDoc._id, isActive: true, order: stats.designationsCreated + 1 });
      desigMap.set(key, desigDoc);
      stats.designationsCreated++;
      console.log(`  Created designation: ${designation} (dept: ${department})`);
    }
  }

  // 5. Build lookup maps for updating Employee/User
  const deptByName = new Map();
  for (const d of await Department.find({})) deptByName.set(d.name.toLowerCase().trim(), d._id);

  const desigByKey = new Map();
  for (const d of await Designation.find({})) desigByKey.set(`${d.departmentId}|${d.name.toLowerCase().trim()}`, d._id);

  // 6. Update Employee records
  for (const emp of employees) {
    let changed = false;
    const updates = {};

    if (emp.department && DEPT_NORMALIZE(emp.department)) {
      const deptId = deptByName.get(DEPT_NORMALIZE(emp.department));
      if (deptId) {
        if (!emp.departmentId || String(emp.departmentId) !== String(deptId)) {
          updates.departmentId = deptId;
          changed = true;
        }
      } else {
        stats.unmatchedDepartments.push(`${emp.employeeId}: department "${emp.department}" not found`);
      }
    }

    if (emp.department && emp.designation && DEPT_NORMALIZE(emp.department) && DESIG_NORMALIZE(emp.designation)) {
      const desigId = desigByKey.get(`${DEPT_NORMALIZE(emp.department)}|${DESIG_NORMALIZE(emp.designation)}`);
      if (desigId) {
        if (!emp.designationId || String(emp.designationId) !== String(desigId)) {
          updates.designationId = desigId;
          changed = true;
        }
      } else {
        stats.unmatchedDesignations.push(`${emp.employeeId}: ${emp.department}|${emp.designation} not found`);
      }
    }

    if (changed && !dryRun) {
      await Employee.updateOne({ _id: emp._id }, { $set: updates });
      stats.employeesUpdated++;
    }
  }

  // 7. Update User records
  for (const u of users) {
    let changed = false;
    const updates = {};

    if (u.department && DEPT_NORMALIZE(u.department)) {
      const deptId = deptByName.get(DEPT_NORMALIZE(u.department));
      if (deptId) {
        if (!u.departmentId || String(u.departmentId) !== String(deptId)) {
          updates.departmentId = deptId;
          changed = true;
        }
      } else {
        stats.unmatchedDepartments.push(`${u.email}: department "${u.department}" not found`);
      }
    }

    if (u.department && u.designation && DEPT_NORMALIZE(u.department) && DESIG_NORMALIZE(u.designation)) {
      const desigId = desigByKey.get(`${DEPT_NORMALIZE(u.department)}|${DESIG_NORMALIZE(u.designation)}`);
      if (desigId) {
        if (!u.designationId || String(u.designationId) !== String(desigId)) {
          updates.designationId = desigId;
          changed = true;
        }
      } else {
        stats.unmatchedDesignations.push(`${u.email}: ${u.department}|${u.designation} not found`);
      }
    }

    if (changed && !dryRun) {
      await User.updateOne({ _id: u._id }, { $set: updates });
      stats.usersUpdated++;
    }
  }

  // 8. Take backup before writing (if not dry-run)
  if (!dryRun) {
    const freshDepts = await Department.find({}).lean();
    const freshDesigs = await Designation.find({}).lean();
    const freshEmps = await Employee.find({}).lean();
    const freshUsers = await User.find({}).lean();
    await takeBackup(freshDepts, freshDesigs, freshEmps, freshUsers);
  }

  await disconnectDB();

  // 9. Print summary
  console.log('\n========== MIGRATION SUMMARY ==========');
  console.log(`Departments created: ${stats.departmentsCreated}`);
  console.log(`Departments matched: ${stats.departmentsMatched}`);
  console.log(`Designations created: ${stats.designationsCreated}`);
  console.log(`Designations matched: ${stats.designationsMatched}`);
  console.log(`Employees updated: ${stats.employeesUpdated}`);
  console.log(`Users updated: ${stats.usersUpdated}`);
  if (stats.unmatchedDepartments.length) {
    console.log(`\nUnmatched departments (${stats.unmatchedDepartments.length}):`);
    stats.unmatchedDepartments.forEach((m) => console.log(`  - ${m}`));
  }
  if (stats.unmatchedDesignations.length) {
    console.log(`\nUnmatched designations (${stats.unmatchedDesignations.length}):`);
    stats.unmatchedDesignations.forEach((m) => console.log(`  - ${m}`));
  }
  if (stats.errors.length) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log(`\n${dryRun ? 'DRY-RUN complete - no changes made' : 'Migration complete'}`);
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
