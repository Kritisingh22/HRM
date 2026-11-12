const fs = require('fs');
const path = require('path');
const { connectDB, mongoose } = require('../../../server/config/database');
const User = require('../../../server/models/User');
const Employee = require('../../../server/models/Employee');

const roleCodes = {
  EMPLOYEE: 'EMP',
  MANAGER: 'MGR',
  HR: 'HR',
  ADMIN: 'ADM',
  SUPER_ADMIN: 'SA',
};

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Set MONGODB_URI to the dedicated k6 test database.');
  }
  if (!['local', 'staging'].includes(process.env.K6_ENV)) {
    throw new Error('Seeding is allowed only with K6_ENV=local or K6_ENV=staging.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed while NODE_ENV=production.');
  }
  if (process.env.K6_SEED_CONFIRM !== 'CREATE_K6_TEST_USERS') {
    throw new Error('Set K6_SEED_CONFIRM=CREATE_K6_TEST_USERS to continue.');
  }
  const uriDatabase = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.replace(/^\/+/, ''));
  if (uriDatabase !== 'cyethack_hrm_k6') {
    throw new Error('MONGODB_URI must select a database named exactly cyethack_hrm_k6; no connection was made.');
  }

  const usersPath = path.resolve(__dirname, process.env.K6_USERS_FILE || '../data/test-users.json');
  const configuredUsers = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const accounts = [];
  const emails = new Set();

  for (const [role, code] of Object.entries(roleCodes)) {
    if (!Array.isArray(configuredUsers[role]) || !configuredUsers[role].length) {
      throw new Error(`Configure at least one dedicated ${role} account in K6_USERS_FILE.`);
    }
    configuredUsers[role].forEach((account, index) => {
      const email = String(account.email || '').trim().toLowerCase();
      if (!email || email.endsWith('.invalid') || !account.password || String(account.password).length < 12
        || /not-a-real|change-me|placeholder/i.test(String(account.password))) {
        throw new Error(`Every ${role} account needs an email and a password of at least 12 characters.`);
      }
      if (emails.has(email)) throw new Error('K6_USERS_FILE contains duplicate emails.');
      emails.add(email);
      accounts.push({
        role,
        code,
        index: index + 1,
        email,
        password: String(account.password),
      });
    });
  }

  await connectDB();
  if (mongoose.connection.name !== 'cyethack_hrm_k6') {
    throw new Error('Seeding requires a database named exactly cyethack_hrm_k6.');
  }

  const existingUsers = await User.find({ email: { $in: [...emails] } }).select('email').lean();
  if (existingUsers.length) {
    throw new Error('Some configured accounts already exist; no records were changed. Use new test-user emails.');
  }
  const employeeIds = accounts.map(({ code, index }) => `K6-${code}-${String(index).padStart(6, '0')}`);
  const existingEmployees = await Employee.find({
    $or: [{ email: { $in: [...emails] } }, { employeeId: { $in: employeeIds } }],
  }).select('_id').lean();
  if (existingEmployees.length) {
    throw new Error('Matching employee records already exist; no records were changed.');
  }

  const manager = accounts.find((account) => account.role === 'MANAGER');
  const hr = accounts.find((account) => account.role === 'HR');
  const createdUsers = [];
  const createdEmployees = [];

  try {
    for (const account of accounts) {
      const employeeId = `K6-${account.code}-${String(account.index).padStart(6, '0')}`;
      const user = new User({
        employeeId,
        fullName: `K6 ${account.role} ${String(account.index).padStart(4, '0')}`,
        email: account.email,
        role: account.role,
        department: 'K6 Test',
        designation: 'Performance Test',
        status: 'active',
        accountStatus: 'active',
        isVerified: true,
        mustChangePassword: false,
      });
      user.password = account.password;
      await user.save();
      createdUsers.push(user);
    }

    const managerEmployeeId = manager && `K6-${manager.code}-${String(manager.index).padStart(6, '0')}`;
    const hrEmployeeId = hr && `K6-${hr.code}-${String(hr.index).padStart(6, '0')}`;

    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      const employeeId = `K6-${account.code}-${String(account.index).padStart(6, '0')}`;
      const employee = await Employee.create({
        employeeId,
        user: createdUsers[index]._id,
        userId: String(createdUsers[index]._id),
        fullName: createdUsers[index].fullName,
        email: account.email,
        department: 'K6 Test',
        designation: 'Performance Test',
        manager: account.role === 'EMPLOYEE' ? managerEmployeeId : undefined,
        assignedHrId: account.role === 'HR' ? null : hrEmployeeId || null,
        workMode: 'Remote',
        location: 'K6 Test',
        salary: 0,
        status: 'Active',
        joiningDate: new Date('2020-01-01T00:00:00.000Z'),
      });
      createdEmployees.push(employee);
    }

    console.log(`Created ${createdUsers.length} dedicated K6 test user(s) and ${createdEmployees.length} synthetic employee record(s).`);
    console.log('Credentials were not printed. Keep K6_USERS_FILE private and ignored by Git.');
    console.log('The seeder never modifies existing accounts or removes business records.');
  } catch (error) {
    try {
      if (createdEmployees.length) {
        await Employee.deleteMany({ _id: { $in: createdEmployees.map((employee) => employee._id) } });
      }
      if (createdUsers.length) {
        await User.deleteMany({ _id: { $in: createdUsers.map((user) => user._id) } });
      }
    } catch (cleanupError) {
      throw new Error(`Seeding failed (${error.message}); rollback also failed (${cleanupError.message}). Inspect only K6-prefixed test records.`);
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(`Performance-test seeding failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
