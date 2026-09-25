/* MongoDB connection via Mongoose. */
const mongoose = require('mongoose');
const cfg = require('./env');

mongoose.set('strictQuery', true);

async function connectDB(uri = cfg.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // eslint-disable-next-line no-console
  console.log('MongoDB connected:', mongoose.connection.host + '/' + mongoose.connection.name);
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, mongoose };
