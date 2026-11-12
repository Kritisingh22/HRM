/* ============================================================
   Seed: Departments & Designations starter data
   ============================================================
   Seeds a starter set of departments and designations derived from
   the values found in the existing seed data (server/seeds/seed.js),
   plus standard additions for an IT/security company.

   Only inserts records that don't already exist (by name for
   departments, by departmentId+name for designations).

   Usage:
     NODE_ENV=development node server/seeds/seed-departments-designations.js
   ============================================================ */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/database');
const Department = require('../models/Department');
const Designation = require('../models/Designation');

const DEPARTMENTS = [
  { name: 'Administration', code: 'ADM', order: 1 },
  { name: 'Human Resources', code: 'HR', order: 2 },
  { name: 'Project Management', code: 'PM', order: 3 },
  { name: 'Engineering', code: 'ENG', order: 4 },
  { name: 'Cyber Security', code: 'SEC', order: 5 },
  { name: 'Quality Assurance', code: 'QA', order: 6 },
  { name: 'Product', code: 'PROD', order: 7 },
  { name: 'Design', code: 'DESIGN', order: 8 },
  { name: 'Finance & Accounts', code: 'FIN', order: 9 },
  { name: 'Sales & Marketing', code: 'SALES', order: 10 },
  { name: 'Operations', code: 'OPS', order: 11 },
  { name: 'IT Support', code: 'IT', order: 12 },
];

const DESIGNATIONS = [
  // Administration
  { department: 'Administration', name: 'Office Administrator', level: 'L1', order: 1 },
  { department: 'Administration', name: 'Administration Manager', level: 'L3', order: 2 },
  // Human Resources
  { department: 'Human Resources', name: 'HR Executive', level: 'L2', order: 1 },
  { department: 'Human Resources', name: 'HR Manager', level: 'L3', order: 2 },
  { department: 'Human Resources', name: 'HR Business Partner', level: 'L3', order: 3 },
  { department: 'Human Resources', name: 'Recruiter', level: 'L2', order: 4 },
  // Project Management
  { department: 'Project Management', name: 'Project Manager', level: 'L3', order: 1 },
  { department: 'Project Management', name: 'Program Manager', level: 'L4', order: 2 },
  // Engineering
  { department: 'Engineering', name: 'Django Developer', level: 'L2', order: 1 },
  { department: 'Engineering', name: 'Senior Software Engineer', level: 'L3', order: 2 },
  { department: 'Engineering', name: 'Tech Lead', level: 'L4', order: 3 },
  { department: 'Engineering', name: 'Engineering Manager', level: 'L4', order: 4 },
  // Cyber Security
  { department: 'Cyber Security', name: 'Security Analyst', level: 'L2', order: 1 },
  { department: 'Cyber Security', name: 'Penetration Tester', level: 'L3', order: 2 },
  { department: 'Cyber Security', name: 'Security Consultant', level: 'L3', order: 3 },
  { department: 'Cyber Security', name: 'SOC Analyst', level: 'L2', order: 4 },
  { department: 'Cyber Security', name: 'Security Lead', level: 'L4', order: 5 },
  // Quality Assurance
  { department: 'Quality Assurance', name: 'QA Engineer', level: 'L2', order: 1 },
  { department: 'Quality Assurance', name: 'Senior QA Engineer', level: 'L3', order: 2 },
  { department: 'Quality Assurance', name: 'QA Lead', level: 'L4', order: 3 },
  // Product
  { department: 'Product', name: 'Product Manager', level: 'L4', order: 1 },
  { department: 'Product', name: 'Business Analyst', level: 'L2', order: 2 },
  // Design
  { department: 'Design', name: 'UI/UX Designer', level: 'L2', order: 1 },
  { department: 'Design', name: 'Graphic Designer', level: 'L2', order: 2 },
  // Finance & Accounts
  { department: 'Finance & Accounts', name: 'Accountant', level: 'L2', order: 1 },
  { department: 'Finance & Accounts', name: 'Finance Manager', level: 'L3', order: 2 },
  // Sales & Marketing
  { department: 'Sales & Marketing', name: 'Sales Executive', level: 'L2', order: 1 },
  { department: 'Sales & Marketing', name: 'Marketing Executive', level: 'L2', order: 2 },
  { department: 'Sales & Marketing', name: 'Business Development Manager', level: 'L3', order: 3 },
  // Operations
  { department: 'Operations', name: 'Operations Executive', level: 'L2', order: 1 },
  { department: 'Operations', name: 'Operations Manager', level: 'L3', order: 2 },
  // IT Support
  { department: 'IT Support', name: 'System Administrator', level: 'L2', order: 1 },
  { department: 'IT Support', name: 'IT Support Engineer', level: 'L1', order: 2 },
];

async function main() {
  await connectDB();

  let createdDepartments = 0;
  let createdDesignations = 0;

  // Seed departments
  for (const dept of DEPARTMENTS) {
    const existing = await Department.findOne({ name: dept.name });
    if (!existing) {
      await Department.create({ name: dept.name, code: dept.code, order: dept.order, isActive: true });
      createdDepartments++;
      console.log(`  Created department: ${dept.name}`);
    } else {
      console.log(`  Skipped (exists): ${dept.name}`);
    }
  }

  // Seed designations (need department references)
  for (const desig of DESIGNATIONS) {
    const dept = await Department.findOne({ name: desig.department });
    if (!dept) {
      console.error(`  Department not found: ${desig.department} - skipping designation ${desig.name}`);
      continue;
    }
    const existing = await Designation.findOne({ name: desig.name, departmentId: dept._id });
    if (!existing) {
      await Designation.create({ name: desig.name, departmentId: dept._id, level: desig.level, order: desig.order, isActive: true });
      createdDesignations++;
      console.log(`  Created designation: ${desig.name} (dept: ${desig.department})`);
    } else {
      console.log(`  Skipped (exists): ${desig.name}`);
    }
  }

  await disconnectDB();

  console.log(`\nSeed complete: ${createdDepartments} departments, ${createdDesignations} designations created.`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
