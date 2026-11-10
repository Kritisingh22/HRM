const mongoose = require('mongoose');
const User = require('../models/User');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/cyethack_hr');
  
  // Test HR login
  const hr = await User.findOne({ email: 'demo.hr.one@cyethack.demo' }).select('+passwordHash');
  console.log('HR User found:', hr ? 'YES' : 'NO');
  if (hr) {
    const ok = await hr.comparePassword('DemoHR123!');
    console.log('HR Password match:', ok);
    console.log('HR Role:', hr.role);
    console.log('HR Status:', hr.status);
    console.log('HR isVerified:', hr.isVerified);
  }

  // Test Manager login
  const mgr = await User.findOne({ email: 'demo.manager.one@cyethack.demo' }).select('+passwordHash');
  console.log('\nManager User found:', mgr ? 'YES' : 'NO');
  if (mgr) {
    const ok = await mgr.comparePassword('DemoMGR123!');
    console.log('Manager Password match:', ok);
    console.log('Manager Role:', mgr.role);
  }

  // Test Employee login
  const emp = await User.findOne({ email: 'demo.employee.one@cyethack.demo' }).select('+passwordHash');
  console.log('\nEmployee User found:', emp ? 'YES' : 'NO');
  if (emp) {
    const ok = await emp.comparePassword('DemoEMP123!');
    console.log('Employee Password match:', ok);
    console.log('Employee Role:', emp.role);
  }

  // List all demo users
  const all = await User.find({ email: /cyethack\.demo/ });
  console.log('\nAll demo users:');
  all.forEach(u => console.log(`  ${u.email} (${u.role})`));

  await mongoose.disconnect();
}

test().catch(console.error);