const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');

async function clear() {
  await mongoose.connect('mongodb://127.0.0.1:27017/cyethack_hr');
  await User.deleteMany({ email: /cyethack\.demo/ });
  await Employee.deleteMany({ employeeId: /DEMO-/ });
  console.log('Cleared demo data');
  await mongoose.disconnect();
}

clear().catch(console.error);