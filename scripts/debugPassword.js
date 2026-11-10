const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function debug() {
  await mongoose.connect('mongodb://127.0.0.1:27017/cyethack_hr');
  
  const user = await User.findOne({ email: 'demo.hr.one@cyethack.demo' }).select('+passwordHash');
  if (!user) {
    console.log('User not found');
    return;
  }
  
  console.log('User found:', user.email);
  console.log('Password hash:', user.passwordHash);
  console.log('Password hash length:', user.passwordHash.length);
  
  // Test comparison with bcrypt directly
  const test1 = await bcrypt.compare('DemoHR123!', user.passwordHash);
  console.log('bcrypt.compare("DemoHR123!"):', test1);
  
  const test2 = await bcrypt.compare('DemoHR123!', user.passwordHash);
  console.log('bcrypt.compare("DemoHR123!") again:', test2);
  
  // Test with the user method
  const test3 = await user.comparePassword('DemoHR123!');
  console.log('user.comparePassword("DemoHR123!"):', test3);
  
  // Hash a test password to verify rounds
  const hash = await bcrypt.hash('DemoHR123!', 12);
  console.log('\nNew hash with 12 rounds:', hash);
  const verify = await bcrypt.compare('DemoHR123!', hash);
  console.log('Verify new hash:', verify);
  
  await mongoose.disconnect();
}

debug().catch(console.error);