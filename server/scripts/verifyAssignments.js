const mongoose = require('mongoose');
const Employee = require('../models/Employee');

async function verifyAssignments() {
  await mongoose.connect('mongodb://127.0.0.1:27017/cyethack_hr');
  
  const teamA = await Employee.find({ manager: 'DEMO-MGR-001', status: 'Active' });
  const teamB = await Employee.find({ manager: 'DEMO-MGR-002', status: 'Active' });
  
  console.log('Team A (Manager: DEMO-MGR-001, HR: DEMO-HR-001):');
  teamA.forEach(e => console.log(`  ${e.employeeId} - ${e.fullName} - HR: ${e.assignedHrId}`));
  
  console.log('\nTeam B (Manager: DEMO-MGR-002, HR: DEMO-HR-002):');
  teamB.forEach(e => console.log(`  ${e.employeeId} - ${e.fullName} - HR: ${e.assignedHrId}`));
  
  console.log(`\nTeam A size: ${teamA.length}`);
  console.log(`Team B size: ${teamB.length}`);
  
  // Verify HR assignments
  const hr1 = await Employee.find({ assignedHrId: 'DEMO-HR-001', status: 'Active' });
  const hr2 = await Employee.find({ assignedHrId: 'DEMO-HR-002', status: 'Active' });
  console.log(`\nHR DEMO-HR-001 has ${hr1.length} employees`);
  console.log(`HR DEMO-HR-002 has ${hr2.length} employees`);
  
  await mongoose.disconnect();
}

verifyAssignments().catch(console.error);