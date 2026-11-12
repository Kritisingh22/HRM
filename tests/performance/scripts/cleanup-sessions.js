const fs = require('fs');
const path = require('path');
const { connectDB, mongoose } = require('../../../server/config/database');
const User = require('../../../server/models/User');
const LoginSession = require('../../../server/models/LoginSession');
const RefreshToken = require('../../../server/models/RefreshToken');
const Notification = require('../../../server/models/Notification');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Set MONGODB_URI to the dedicated k6 test database.');
  }
  if (!['local', 'staging'].includes(process.env.K6_ENV)) {
    throw new Error('Cleanup is allowed only with K6_ENV=local or K6_ENV=staging.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing cleanup while NODE_ENV=production.');
  }
  if (process.env.K6_CLEANUP_CONFIRM !== 'DELETE_K6_TEST_SESSIONS') {
    throw new Error('Set K6_CLEANUP_CONFIRM=DELETE_K6_TEST_SESSIONS to continue.');
  }
  const uriDatabase = decodeURIComponent(new URL(process.env.MONGODB_URI).pathname.replace(/^\/+/, ''));
  if (uriDatabase !== 'cyethack_hrm_k6') {
    throw new Error('MONGODB_URI must select a database named exactly cyethack_hrm_k6; no connection was made.');
  }

  const usersPath = path.resolve(__dirname, process.env.K6_USERS_FILE || '../data/test-users.json');
  const userConfig = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const emails = [...new Set(
    Object.values(userConfig).flat().map((account) => String(account.email || '').trim().toLowerCase()).filter(Boolean),
  )];
  if (!emails.length) throw new Error('No test-user emails found; no records were changed.');

  await connectDB();
  if (mongoose.connection.name !== 'cyethack_hrm_k6') {
    throw new Error('Cleanup database must be named exactly cyethack_hrm_k6; no records were changed.');
  }

  const matchedUsers = await User.find({ email: { $in: emails } }).select('_id').lean();
  const userIds = matchedUsers.map((user) => user._id);
  if (!userIds.length) {
    console.log('No configured test accounts were found; no records were changed.');
    return;
  }

  const sessions = await LoginSession.find({ user: { $in: userIds } }).select('_id').lean();
  const sessionIds = sessions.map((session) => session._id);
  const notificationResult = sessionIds.length
    ? await Notification.deleteMany({ 'metadata.sessionId': { $in: sessionIds } })
    : { deletedCount: 0 };
  const sessionResult = await LoginSession.deleteMany({ user: { $in: userIds } });
  const refreshResult = await RefreshToken.deleteMany({ user: { $in: userIds } });

  console.log(`Removed ${sessionResult.deletedCount || 0} test login session(s).`);
  console.log(`Removed ${refreshResult.deletedCount || 0} test refresh token(s).`);
  console.log(`Removed ${notificationResult.deletedCount || 0} notification(s) tied to those sessions.`);
}

main()
  .catch((error) => {
    console.error(`Performance-test cleanup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
