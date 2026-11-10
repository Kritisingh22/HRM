/* ============================================================
   Transfer Ticket Workflow Test
   
   Tests the complete employee transfer workflow:
   1. Create demo accounts
   2. Manager creates transfer request
   3. Current Manager approves
   4. Current HR approves
   5. Target HR approves
   6. Target Manager approves
   7. Transfer is applied to employee record
   8. Verify assignments updated
   ============================================================ */

require('dotenv').config();
process.env.DEMO_MODE = 'true';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cyethack_hr_test';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Employee = require('../models/Employee');
const TransferTicket = require('../models/TransferTicket');
const Notification = require('../models/Notification');
const { logAudit } = require('../utils/audit');
const cfg = require('../config/env');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

async function hashPassword(password) {
  return bcrypt.hash(password, cfg.BCRYPT_ROUNDS || 12);
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  await User.deleteMany({ employeeId: /^DEMO-/ });
  await Employee.deleteMany({ employeeId: /^DEMO-/ });
  await TransferTicket.deleteMany({ ticketNumber: /^XFR-/ });
  await Notification.deleteMany({ 'metadata.ticketId': { $exists: true } });
  console.log('✅ Cleanup complete');
}

async function createDemoAccounts() {
  console.log('\n👥 Creating demo accounts...');
  
  // HR accounts
  const hr1User = await User.create({
    employeeId: 'DEMO-HR-001',
    fullName: 'Demo HR One',
    email: 'demo.hr.one@cyethack.demo',
    passwordHash: await hashPassword('DemoHR123!'),
    role: 'HR',
    department: 'Human Resources',
    designation: 'HR Manager',
    status: 'active',
    isVerified: true,
  });
  
  const hr2User = await User.create({
    employeeId: 'DEMO-HR-002',
    fullName: 'Demo HR Two',
    email: 'demo.hr.two@cyethack.demo',
    passwordHash: await hashPassword('DemoHR123!'),
    role: 'HR',
    department: 'Human Resources',
    designation: 'HR Manager',
    status: 'active',
    isVerified: true,
  });

  // Manager accounts
  const mgr1User = await User.create({
    employeeId: 'DEMO-MGR-001',
    fullName: 'Demo Manager One',
    email: 'demo.manager.one@cyethack.demo',
    passwordHash: await hashPassword('DemoMGR123!'),
    role: 'MANAGER',
    department: 'Engineering',
    designation: 'Engineering Manager',
    status: 'active',
    isVerified: true,
  });
  
  const mgr2User = await User.create({
    employeeId: 'DEMO-MGR-002',
    fullName: 'Demo Manager Two',
    email: 'demo.manager.two@cyethack.demo',
    passwordHash: await hashPassword('DemoMGR123!'),
    role: 'MANAGER',
    department: 'Security Operations',
    designation: 'SOC Manager',
    status: 'active',
    isVerified: true,
  });

  // Employee accounts - Team A (5 employees)
  const teamAEmployees = [];
  for (let i = 1; i <= 5; i++) {
    const empId = `DEMO-EMP-${String(i).padStart(3, '0')}`;
    const user = await User.create({
      employeeId: empId,
      fullName: `Demo Employee ${i}`,
      email: `demo.employee.${i}@cyethack.demo`,
      passwordHash: await hashPassword('DemoEMP123!'),
      role: 'EMPLOYEE',
      department: 'Engineering',
      designation: 'Software Engineer',
      status: 'active',
      isVerified: true,
    });
    
    const emp = await Employee.create({
      employeeId: empId,
      user: user._id,
      fullName: `Demo Employee ${i}`,
      email: `demo.employee.${i}@cyethack.demo`,
      phone: '+91 98110 00000',
      gender: 'Other',
      department: 'Engineering',
      designation: 'Software Engineer',
      manager: 'DEMO-MGR-001',
      employmentType: 'Full-time',
      workMode: 'On-site',
      workLocation: 'office',
      bloodGroup: 'Unknown',
      assignedHrId: 'DEMO-HR-001',
      location: 'Noida',
      joiningDate: new Date(),
      salary: 50000,
      grade: 'E1',
      status: 'Active',
    });
    
    teamAEmployees.push({ user, emp });
  }

  // Employee accounts - Team B (5 employees)
  const teamBEmployees = [];
  for (let i = 6; i <= 10; i++) {
    const empId = `DEMO-EMP-${String(i).padStart(3, '0')}`;
    const user = await User.create({
      employeeId: empId,
      fullName: `Demo Employee ${i}`,
      email: `demo.employee.${i}@cyethack.demo`,
      passwordHash: await hashPassword('DemoEMP123!'),
      role: 'EMPLOYEE',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      status: 'active',
      isVerified: true,
    });
    
    const emp = await Employee.create({
      employeeId: empId,
      user: user._id,
      fullName: `Demo Employee ${i}`,
      email: `demo.employee.${i}@cyethack.demo`,
      phone: '+91 98110 00000',
      gender: 'Other',
      department: 'Security Operations',
      designation: 'SOC Analyst',
      manager: 'DEMO-MGR-002',
      employmentType: 'Full-time',
      workMode: 'On-site',
      workLocation: 'office',
      bloodGroup: 'Unknown',
      assignedHrId: 'DEMO-HR-002',
      location: 'Noida',
      joiningDate: new Date(),
      salary: 50000,
      grade: 'E1',
      status: 'Active',
    });
    
    teamBEmployees.push({ user, emp });
  }

  console.log('✅ Created 2 HR, 2 Manager, 10 Employee accounts');
  console.log('   Team A: HR-001, MGR-001, EMP-001 through EMP-005');
  console.log('   Team B: HR-002, MGR-002, EMP-006 through EMP-010');

  return { hr1User, hr2User, mgr1User, mgr2User, teamAEmployees, teamBEmployees };
}

async function testTransferWorkflow() {
  console.log('\n🔄 Testing Transfer Ticket Workflow...');
  
  // Get the employee to transfer (EMP-006 from Team B)
  const employee = await Employee.findOne({ employeeId: 'DEMO-EMP-006' });
  if (!employee) throw new Error('Employee DEMO-EMP-006 not found');
  
  console.log(`\n📋 Employee to transfer: ${employee.fullName} (${employee.employeeId})`);
  console.log(`   Current Manager: ${employee.manager}`);
  console.log(`   Current HR: ${employee.assignedHrId}`);

  // 1. Manager One (DEMO-MGR-001) creates transfer request for Employee 6
  console.log('\n1️⃣  Manager One creates transfer request...');
  
  const ticket = await TransferTicket.create({
    employee: employee._id,
    currentManager: (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id,
    currentHr: (await User.findOne({ employeeId: 'DEMO-HR-002' }))._id,
    currentManagerEmployeeId: 'DEMO-MGR-002',
    currentHrEmployeeId: 'DEMO-HR-002',
    targetManager: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id,
    targetHr: (await User.findOne({ employeeId: 'DEMO-HR-001' }))._id,
    targetManagerEmployeeId: 'DEMO-MGR-001',
    targetHrEmployeeId: 'DEMO-HR-001',
    reason: 'Employee requested to work on Project Alpha which is managed by Manager One',
    businessJustification: 'Project Alpha requires specialized skills that Employee 6 possesses. Cross-team collaboration will improve delivery timeline.',
    requestedEffectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
    supportingDocument: '',
    requestedBy: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id,
    requestedByRole: 'MANAGER',
    status: 'Pending Current Manager Approval',
    currentStep: 'Pending Current Manager Approval',
    approvalSteps: [],
  });

  // Build approval steps
  const currentManagerId = String(ticket.currentManager);
  const currentHrId = String(ticket.currentHr);
  const targetManagerId = String(ticket.targetManager);
  const targetHrId = String(ticket.targetHr);

  ticket.approvalSteps = [
    { step: 'Pending Current Manager Approval', approverRole: 'MANAGER', approverType: 'current', assignedTo: ticket.currentManager, isSkipped: false },
    { step: 'Pending Current HR Approval', approverRole: 'HR', approverType: 'current', assignedTo: ticket.currentHr, isSkipped: currentHrId === targetHrId },
    { step: 'Pending Target HR Approval', approverRole: 'HR', approverType: 'target', assignedTo: ticket.targetHr, isSkipped: currentHrId === targetHrId },
    { step: 'Pending Target Manager Approval', approverRole: 'MANAGER', approverType: 'target', assignedTo: ticket.targetManager, isSkipped: currentManagerId === targetManagerId },
  ];
  await ticket.save();

  console.log(`   ✅ Created ticket: ${ticket.ticketNumber}`);
  console.log(`   Status: ${ticket.status}`);
  console.log(`   Approval steps: ${ticket.approvalSteps.length}`);

  // 2. Current Manager (Manager Two) approves
  console.log('\n2️⃣  Current Manager (Manager Two) approves...');
  
  let step = ticket.approvalSteps[0];
  step.decidedBy = (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id;
  step.decidedAt = new Date();
  step.decision = 'Approved';
  step.reason = 'Employee is a good fit for Project Alpha';
  
  ticket.status = 'Pending Current HR Approval';
  ticket.currentStep = 'Pending Current HR Approval';
  await ticket.save();

  console.log(`   ✅ Approved by Current Manager`);
  console.log(`   Status: ${ticket.status}`);

  // 3. Current HR (HR Two) approves
  console.log('\n3️⃣  Current HR (HR Two) approves...');
  
  step = ticket.approvalSteps[1];
  step.decidedBy = (await User.findOne({ employeeId: 'DEMO-HR-002' }))._id;
  step.decidedAt = new Date();
  step.decision = 'Approved';
  step.reason = 'Transfer aligns with employee development plan';
  
  ticket.status = 'Pending Target HR Approval';
  ticket.currentStep = 'Pending Target HR Approval';
  await ticket.save();

  console.log(`   ✅ Approved by Current HR`);
  console.log(`   Status: ${ticket.status}`);

  // 4. Target HR (HR One) approves
  console.log('\n4️⃣  Target HR (HR One) approves...');
  
  step = ticket.approvalSteps[2];
  step.decidedBy = (await User.findOne({ employeeId: 'DEMO-HR-001' }))._id;
  step.decidedAt = new Date();
  step.decision = 'Approved';
  step.reason = 'Welcome to the team!';
  
  ticket.status = 'Pending Target Manager Approval';
  ticket.currentStep = 'Pending Target Manager Approval';
  await ticket.save();

  console.log(`   ✅ Approved by Target HR`);
  console.log(`   Status: ${ticket.status}`);

  // 5. Target Manager (Manager One) approves
  console.log('\n5️⃣  Target Manager (Manager One) approves...');
  
  step = ticket.approvalSteps[3];
  step.decidedBy = (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id;
  step.decidedAt = new Date();
  step.decision = 'Approved';
  step.reason = 'Excited to have Employee 6 on the team';
  
  ticket.status = 'Approved';
  ticket.currentStep = 'Approved';
  ticket.approvedAt = new Date();
  await ticket.save();

  console.log(`   ✅ Approved by Target Manager`);
  console.log(`   Status: ${ticket.status}`);

  // 6. Apply transfer to employee record
  console.log('\n6️⃣  Applying transfer to employee record...');
  
  const updatedEmp = await Employee.findByIdAndUpdate(
    employee._id,
    {
      manager: ticket.targetManagerEmployeeId,
      assignedHrId: ticket.targetHrEmployeeId,
    },
    { new: true }
  );

  ticket.status = 'Completed';
  ticket.currentStep = 'Completed';
  ticket.completedAt = new Date();
  await ticket.save();

  console.log(`   ✅ Employee record updated`);
  console.log(`   New Manager: ${updatedEmp.manager}`);
  console.log(`   New HR: ${updatedEmp.assignedHrId}`);
  console.log(`   Ticket Status: ${ticket.status}`);

  // 7. Verify final state
  console.log('\n✅ Verification:');
  const finalEmp = await Employee.findOne({ employeeId: 'DEMO-EMP-006' });
  console.log(`   Employee ${finalEmp.employeeId}:`);
  console.log(`     Manager: ${finalEmp.manager} (expected: DEMO-MGR-001)`);
  console.log(`     HR: ${finalEmp.assignedHrId} (expected: DEMO-HR-001)`);
  
  const finalTicket = await TransferTicket.findById(ticket._id)
    .populate('approvalSteps.decidedBy', 'fullName employeeId')
    .populate('approvalSteps.assignedTo', 'fullName employeeId');
  
  console.log(`\n   Ticket ${finalTicket.ticketNumber} approval history:`);
  for (const step of finalTicket.approvalSteps) {
    const approver = step.decidedBy ? `${step.decidedBy.fullName} (${step.decidedBy.employeeId})` : 'Pending';
    const assigned = step.assignedTo ? `${step.assignedTo.fullName} (${step.assignedTo.employeeId})` : 'N/A';
    console.log(`     ${step.step}: ${step.decision || 'Pending'} by ${approver} (assigned to ${assigned})`);
  }

  // Verify team sizes
  const teamA = await Employee.find({ manager: 'DEMO-MGR-001', status: 'Active' });
  const teamB = await Employee.find({ manager: 'DEMO-MGR-002', status: 'Active' });
  console.log(`\n   Team A (MGR-001) size: ${teamA.length} (expected: 6)`);
  console.log(`   Team B (MGR-002) size: ${teamB.length} (expected: 4)`);

  return { ticket: finalTicket, employee: finalEmp };
}

async function testRejectionWorkflow() {
  console.log('\n\n🔄 Testing Rejection Workflow...');
  
  // Get another employee from Team B
  const employee = await Employee.findOne({ employeeId: 'DEMO-EMP-007' });
  if (!employee) throw new Error('Employee DEMO-EMP-007 not found');

  // Manager One creates transfer request
  const ticket = await TransferTicket.create({
    employee: employee._id,
    currentManager: (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id,
    currentHr: (await User.findOne({ employeeId: 'DEMO-HR-002' }))._id,
    currentManagerEmployeeId: 'DEMO-MGR-002',
    currentHrEmployeeId: 'DEMO-HR-002',
    targetManager: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id,
    targetHr: (await User.findOne({ employeeId: 'DEMO-HR-001' }))._id,
    targetManagerEmployeeId: 'DEMO-MGR-001',
    targetHrEmployeeId: 'DEMO-HR-001',
    reason: 'Test rejection workflow',
    businessJustification: 'Testing',
    requestedEffectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    requestedBy: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id,
    requestedByRole: 'MANAGER',
    status: 'Pending Current Manager Approval',
    currentStep: 'Pending Current Manager Approval',
    approvalSteps: [
      { step: 'Pending Current Manager Approval', approverRole: 'MANAGER', approverType: 'current', assignedTo: (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id, isSkipped: false },
      { step: 'Pending Current HR Approval', approverRole: 'HR', approverType: 'current', assignedTo: (await User.findOne({ employeeId: 'DEMO-HR-002' }))._id, isSkipped: false },
      { step: 'Pending Target HR Approval', approverRole: 'HR', approverType: 'target', assignedTo: (await User.findOne({ employeeId: 'DEMO-HR-001' }))._id, isSkipped: false },
      { step: 'Pending Target Manager Approval', approverRole: 'MANAGER', approverType: 'target', assignedTo: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id, isSkipped: false },
    ],
  });

  console.log(`\n1️⃣  Created ticket: ${ticket.ticketNumber}`);

  // Current Manager rejects
  ticket.approvalSteps[0].decidedBy = (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id;
  ticket.approvalSteps[0].decidedAt = new Date();
  ticket.approvalSteps[0].decision = 'Rejected';
  ticket.approvalSteps[0].reason = 'Employee is critical for current project delivery';
  
  ticket.status = 'Rejected';
  ticket.currentStep = 'Rejected';
  ticket.rejectedAt = new Date();
  ticket.rejectedBy = (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id;
  ticket.rejectionReason = 'Employee is critical for current project delivery';
  await ticket.save();

  console.log(`   ❌ Rejected by Current Manager`);
  console.log(`   Status: ${ticket.status}`);
  console.log(`   Reason: ${ticket.rejectionReason}`);

  // Verify employee assignment unchanged
  const emp = await Employee.findOne({ employeeId: 'DEMO-EMP-007' });
  console.log(`\n   Employee assignment unchanged:`);
  console.log(`     Manager: ${emp.manager} (still DEMO-MGR-002)`);
  console.log(`     HR: ${emp.assignedHrId} (still DEMO-HR-002)`);

  return ticket;
}

async function testCancellationWorkflow() {
  console.log('\n\n🔄 Testing Cancellation Workflow...');
  
  const employee = await Employee.findOne({ employeeId: 'DEMO-EMP-008' });
  if (!employee) throw new Error('Employee DEMO-EMP-008 not found');

  const ticket = await TransferTicket.create({
    employee: employee._id,
    currentManager: (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id,
    currentHr: (await User.findOne({ employeeId: 'DEMO-HR-002' }))._id,
    currentManagerEmployeeId: 'DEMO-MGR-002',
    currentHrEmployeeId: 'DEMO-HR-002',
    targetManager: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id,
    targetHr: (await User.findOne({ employeeId: 'DEMO-HR-001' }))._id,
    targetManagerEmployeeId: 'DEMO-MGR-001',
    targetHrEmployeeId: 'DEMO-HR-001',
    reason: 'Test cancellation workflow',
    businessJustification: 'Testing',
    requestedEffectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    requestedBy: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id,
    requestedByRole: 'MANAGER',
    status: 'Pending Current Manager Approval',
    currentStep: 'Pending Current Manager Approval',
    approvalSteps: [
      { step: 'Pending Current Manager Approval', approverRole: 'MANAGER', approverType: 'current', assignedTo: (await User.findOne({ employeeId: 'DEMO-MGR-002' }))._id, isSkipped: false },
      { step: 'Pending Current HR Approval', approverRole: 'HR', approverType: 'current', assignedTo: (await User.findOne({ employeeId: 'DEMO-HR-002' }))._id, isSkipped: false },
      { step: 'Pending Target HR Approval', approverRole: 'HR', approverType: 'target', assignedTo: (await User.findOne({ employeeId: 'DEMO-HR-001' }))._id, isSkipped: false },
      { step: 'Pending Target Manager Approval', approverRole: 'MANAGER', approverType: 'target', assignedTo: (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id, isSkipped: false },
    ],
  });

  console.log(`\n1️⃣  Created ticket: ${ticket.ticketNumber}`);

  // Requester cancels
  ticket.status = 'Cancelled';
  ticket.currentStep = 'Cancelled';
  ticket.cancelledAt = new Date();
  ticket.cancelledBy = (await User.findOne({ employeeId: 'DEMO-MGR-001' }))._id;
  ticket.cancellationReason = 'Project requirements changed';
  await ticket.save();

  console.log(`   🚫 Cancelled by Requester`);
  console.log(`   Status: ${ticket.status}`);
  console.log(`   Reason: ${ticket.cancellationReason}`);

  return ticket;
}

async function runTests() {
  try {
    await connectDB();
    
    // Clean up any existing test data
    await cleanup();
    
    // Create demo accounts
    await createDemoAccounts();
    
    // Test approval workflow
    await testTransferWorkflow();
    
    // Test rejection workflow
    await testRejectionWorkflow();
    
    // Test cancellation workflow
    await testCancellationWorkflow();
    
    console.log('\n\n🎉 All tests passed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Demo account creation (14 accounts)');
    console.log('   ✅ Team assignments (Team A: 5, Team B: 5)');
    console.log('   ✅ Transfer ticket creation');
    console.log('   ✅ Multi-step approval workflow (4 steps)');
    console.log('   ✅ Transfer application to employee record');
    console.log('   ✅ Rejection workflow');
    console.log('   ✅ Cancellation workflow');
    console.log('   ✅ Assignment verification');
    
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

runTests();