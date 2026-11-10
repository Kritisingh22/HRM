/* ============================================================
   Demo Seed Script — Creates 14 demo accounts for the HRM portal.
   
   Usage: 
     NODE_ENV=demo node server/scripts/seedDemoAccounts.js
   
   This script is idempotent - running it multiple times will not create duplicates.
   It requires the DEMO_MODE environment variable to be set to 'true' to run.
   ============================================================ */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Employee = require('../models/Employee');
const cfg = require('../config/env');

// Safety check - only run in demo mode
if (process.env.DEMO_MODE !== 'true') {
  console.error('❌ REFUSING TO RUN: This script requires DEMO_MODE=true environment variable.');
  console.error('   This prevents accidental execution against production databases.');
  console.error('   Set DEMO_MODE=true to confirm you want to seed demo accounts.');
  process.exit(1);
}

// Demo account definitions
const DEMO_ACCOUNTS = {
  hr: [
    {
      employeeId: 'DEMO-HR-001',
      fullName: 'Demo HR One',
      email: 'demo.hr.one@cyethack.demo',
      role: 'HR',
      department: 'Human Resources',
      designation: 'HR Manager',
      password: 'DemoHR123!',
    },
    {
      employeeId: 'DEMO-HR-002',
      fullName: 'Demo HR Two',
      email: 'demo.hr.two@cyethack.demo',
      role: 'HR',
      department: 'Human Resources',
      designation: 'HR Manager',
      password: 'DemoHR123!',
    },
  ],
  manager: [
    {
      employeeId: 'DEMO-MGR-001',
      fullName: 'Demo Manager One',
      email: 'demo.manager.one@cyethack.demo',
      role: 'MANAGER',
      department: 'Engineering',
      designation: 'Engineering Manager',
      password: 'DemoMGR123!',
    },
    {
      employeeId: 'DEMO-MGR-002',
      fullName: 'Demo Manager Two',
      email: 'demo.manager.two@cyethack.demo',
      role: 'MANAGER',
      department: 'Security Operations',
      designation: 'SOC Manager',
      password: 'DemoMGR123!',
    },
  ],
  employee: [
    {
      employeeId: 'DEMO-EMP-001',
      fullName: 'Demo Employee One',
      email: 'demo.employee.one@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Engineering',
      designation: 'Software Engineer',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-001',
      primaryManagerId: 'DEMO-MGR-001',
    },
    {
      employeeId: 'DEMO-EMP-002',
      fullName: 'Demo Employee Two',
      email: 'demo.employee.two@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Engineering',
      designation: 'Software Engineer',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-001',
      primaryManagerId: 'DEMO-MGR-001',
    },
    {
      employeeId: 'DEMO-EMP-003',
      fullName: 'Demo Employee Three',
      email: 'demo.employee.three@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Engineering',
      designation: 'Software Engineer',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-001',
      primaryManagerId: 'DEMO-MGR-001',
    },
    {
      employeeId: 'DEMO-EMP-004',
      fullName: 'Demo Employee Four',
      email: 'demo.employee.four@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Engineering',
      designation: 'Software Engineer',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-001',
      primaryManagerId: 'DEMO-MGR-001',
    },
    {
      employeeId: 'DEMO-EMP-005',
      fullName: 'Demo Employee Five',
      email: 'demo.employee.five@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Engineering',
      designation: 'Software Engineer',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-001',
      primaryManagerId: 'DEMO-MGR-001',
    },
    {
      employeeId: 'DEMO-EMP-006',
      fullName: 'Demo Employee Six',
      email: 'demo.employee.six@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-002',
      primaryManagerId: 'DEMO-MGR-002',
    },
    {
      employeeId: 'DEMO-EMP-007',
      fullName: 'Demo Employee Seven',
      email: 'demo.employee.seven@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-002',
      primaryManagerId: 'DEMO-MGR-002',
    },
    {
      employeeId: 'DEMO-EMP-008',
      fullName: 'Demo Employee Eight',
      email: 'demo.employee.eight@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-002',
      primaryManagerId: 'DEMO-MGR-002',
    },
    {
      employeeId: 'DEMO-EMP-009',
      fullName: 'Demo Employee Nine',
      email: 'demo.employee.nine@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-002',
      primaryManagerId: 'DEMO-MGR-002',
    },
    {
      employeeId: 'DEMO-EMP-010',
      fullName: 'Demo Employee Ten',
      email: 'demo.employee.ten@cyethack.demo',
      role: 'EMPLOYEE',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      password: 'DemoEMP123!',
      primaryHrId: 'DEMO-HR-002',
      primaryManagerId: 'DEMO-MGR-002',
    },
  ],
};

async function connectDB() {
  const uri = process.env.MONGODB_URI || cfg.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI not configured');
  }
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

async function hashPassword(password) {
  return bcrypt.hash(password, cfg.BCRYPT_ROUNDS || 12);
}

async function createOrUpdateUser(account) {
  const existing = await User.findOne({ 
    $or: [{ employeeId: account.employeeId }, { email: account.email }] 
  });

  if (existing) {
    console.log(`  ⏭️  User ${account.employeeId} already exists, skipping`);
    return { user: existing, created: false };
  }

  const passwordHash = await hashPassword(account.password);
  
  const user = await User.create({
    employeeId: account.employeeId,
    fullName: account.fullName,
    email: account.email,
    passwordHash,
    role: account.role,
    department: account.department,
    designation: account.designation,
    status: 'active',
    isVerified: true,
  });

  console.log(`  ✅ Created user: ${account.employeeId} (${account.fullName})`);
  return { user, created: true };
}

async function createOrUpdateEmployee(account, userId, primaryHrId, primaryManagerId) {
  const existing = await Employee.findOne({ 
    $or: [{ employeeId: account.employeeId }, { user: userId }] 
  });

  if (existing) {
    console.log(`  ⏭️  Employee ${account.employeeId} already exists, skipping`);
    return { employee: existing, created: false };
  }

  const employee = await Employee.create({
    employeeId: account.employeeId,
    user: userId,
    fullName: account.fullName,
    email: account.email,
    phone: '+91 98110 00000',
    gender: 'Other',
    department: account.department,
    designation: account.designation,
    manager: primaryManagerId,
    employmentType: 'Full-time',
    workMode: 'On-site',
    workLocation: 'office',
    bloodGroup: 'Unknown',
    assignedHrId: primaryHrId,
    location: 'Noida',
    joiningDate: new Date(),
    salary: 50000,
    grade: 'E1',
    status: 'Active',
  });

  console.log(`  ✅ Created employee: ${account.employeeId} (${account.fullName})`);
  return { employee, created: true };
}

async function seedDemoAccounts() {
  console.log('\n🌱 Starting demo account seeding...\n');
  console.log('📋 Configuration:');
  console.log('   - 2 HR accounts');
  console.log('   - 2 Manager accounts');
  console.log('   - 10 Employee accounts');
  console.log('   - Team A: HR-001, MGR-001, EMP-001 through EMP-005');
  console.log('   - Team B: HR-002, MGR-002, EMP-006 through EMP-010\n');

  const results = {
    created: 0,
    skipped: 0,
    errors: 0,
    accounts: [],
  };

  // Map to store created user IDs by employeeId for linking
  const userMap = new Map();

  // 1. Create HR accounts
  console.log('👥 Creating HR accounts...');
  for (const account of DEMO_ACCOUNTS.hr) {
    try {
      const { user, created } = await createOrUpdateUser(account);
      userMap.set(account.employeeId, user._id);
      if (created) results.created++;
      else results.skipped++;
      results.accounts.push({ ...account, userId: user._id, created });
    } catch (err) {
      console.error(`  ❌ Failed to create HR ${account.employeeId}:`, err.message);
      results.errors++;
    }
  }

  // 2. Create Manager accounts
  console.log('\n👥 Creating Manager accounts...');
  for (const account of DEMO_ACCOUNTS.manager) {
    try {
      const { user, created } = await createOrUpdateUser(account);
      userMap.set(account.employeeId, user._id);
      if (created) results.created++;
      else results.skipped++;
      results.accounts.push({ ...account, userId: user._id, created });
    } catch (err) {
      console.error(`  ❌ Failed to create Manager ${account.employeeId}:`, err.message);
      results.errors++;
    }
  }

  // 3. Create Employee accounts
  console.log('\n👥 Creating Employee accounts...');
  for (const account of DEMO_ACCOUNTS.employee) {
    try {
      const { user, created } = await createOrUpdateUser(account);
      userMap.set(account.employeeId, user._id);
      
      if (created) results.created++;
      else results.skipped++;
      
      // Create employee record with assignments
      const hrUserId = userMap.get(account.primaryHrId);
      const mgrUserId = userMap.get(account.primaryManagerId);
      
      if (!hrUserId || !mgrUserId) {
        throw new Error(`Referenced HR (${account.primaryHrId}) or Manager (${account.primaryManagerId}) not found`);
      }

      const { employee, created: empCreated } = await createOrUpdateEmployee(
        account,
        user._id,
        account.primaryHrId,
        account.primaryManagerId
      );

      if (empCreated) results.created++;
      else results.skipped++;
      
      results.accounts.push({ ...account, userId: user._id, employeeId: employee._id, created: created || empCreated });
    } catch (err) {
      console.error(`  ❌ Failed to create Employee ${account.employeeId}:`, err.message);
      results.errors++;
    }
  }

  // Summary
  console.log('\n📊 Seeding Summary:');
  console.log(`   ✅ Created: ${results.created}`);
  console.log(`   ⏭️  Skipped (already exist): ${results.skipped}`);
  console.log(`   ❌ Errors: ${results.errors}`);
  console.log(`   📝 Total accounts processed: ${results.accounts.length}`);

  // Verify assignments
  console.log('\n🔍 Verifying assignments...');
  const hr001Employees = await Employee.find({ assignedHrId: 'DEMO-HR-001', status: 'Active' });
  const hr002Employees = await Employee.find({ assignedHrId: 'DEMO-HR-002', status: 'Active' });
  const mgr001Employees = await Employee.find({ manager: 'DEMO-MGR-001', status: 'Active' });
  const mgr002Employees = await Employee.find({ manager: 'DEMO-MGR-002', status: 'Active' });

  console.log(`   HR DEMO-HR-001 has ${hr001Employees.length} employees`);
  console.log(`   HR DEMO-HR-002 has ${hr002Employees.length} employees`);
  console.log(`   Manager DEMO-MGR-001 has ${mgr001Employees.length} employees`);
  console.log(`   Manager DEMO-MGR-002 has ${mgr002Employees.length} employees`);

  if (hr001Employees.length === 5 && hr002Employees.length === 5 && 
      mgr001Employees.length === 5 && mgr002Employees.length === 5) {
    console.log('\n✅ All assignments verified correctly!');
    console.log('   Team A (HR-001 + MGR-001): 5 employees');
    console.log('   Team B (HR-002 + MGR-002): 5 employees');
  } else {
    console.log('\n⚠️  Assignment verification failed - counts do not match expected values');
  }

  console.log('\n🔐 Demo Credentials (passwords are hashed in database):');
  console.log('   HR: demo.hr.one@cyethack.demo / DemoHR123!');
  console.log('   HR: demo.hr.two@cyethack.demo / DemoHR123!');
  console.log('   MGR: demo.manager.one@cyethack.demo / DemoMGR123!');
  console.log('   MGR: demo.manager.two@cyethack.demo / DemoMGR123!');
  console.log('   EMP: demo.employee.one@cyethack.demo / DemoEMP123!');
  console.log('   ... (all employees use DemoEMP123!)');
  console.log('\n   ⚠️  These are DEMO credentials only. Change on first login.');
  console.log('   ⚠️  Never use these in production.\n');

  return results;
}

async function main() {
  try {
    await connectDB();
    await seedDemoAccounts();
  } catch (err) {
    console.error('\n💥 Seeding failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

main();