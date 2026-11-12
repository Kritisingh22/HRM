/* MongoDB connection via Mongoose.
 *
 * Availability design (Phase 1 of the Lighthouse QA plan):
 *   • The HTTP server in server.js starts FIRST and connectDB() runs in the
 *     background — /health and the static portal shell never wait on MongoDB.
 *   • The connection is tuned for production unreliability: bounded pool,
 *     bounded timeouts, IPv4-first, automatic retries/reconnects.
 *   • connectDB() rejection is logged, never fatal: API routes that need the
 *     database return errors until MongoDB recovers (mongoose retries
 *     automatically), while the portal shell and /health keep serving.
 */
const mongoose = require("mongoose");
const cfg = require("./env");

mongoose.set("strictQuery", true);

/* Connection options:
 *  serverSelectionTimeoutMS  - fail fast (10s) instead of hanging indefinitely
 *  socketTimeoutMS           - close dead sockets after 45s
 *  connectTimeoutMS          - TCP connect timeout
 *  maxPoolSize / minPoolSize - bound the connection pool so a DB hiccup can't
 *                              exhaust file descriptors
 *  retryWrites / retryReads  - automatic idempotent retries after failover
 *  family: 4                 - prefer IPv4 (avoids IPv6 DNS delays on some
 *                              networks/platforms)
 */
const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  family: 4,
};

async function connectDB(uri = cfg.MONGODB_URI) {
  await mongoose.connect(uri, MONGO_OPTIONS);
  if (cfg.isProd && mongoose.connection.name === "test") {
    // Never log the URI; only warn about the selected database name.
    // eslint-disable-next-line no-console
    console.error(
      'WARNING: MongoDB URI selects database "test" in production; verify MONGODB_URI uses the intended database.',
    );
  }
  // eslint-disable-next-line no-console
  console.log(
    "MongoDB connected:",
    mongoose.connection.host + "/" + mongoose.connection.name,
  );
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

/* Log (never crash on) lifecycle events so outages are visible in logs while
 * the portal shell and /health keep serving. */
mongoose.connection.on("connected", () => {
  // eslint-disable-next-line no-console
  console.log("MongoDB connection established.");
});
mongoose.connection.on("reconnected", () => {
  // eslint-disable-next-line no-console
  console.log("MongoDB reconnected after temporary outage.");
});
mongoose.connection.on("disconnected", () => {
  // eslint-disable-next-line no-console
  console.error("MongoDB disconnected - /health and portal shell still serving; DB-backed API routes will error until reconnect.");
});
mongoose.connection.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("MongoDB connection error:", err.message, "- portal shell and /health still serving.");
});

module.exports = { connectDB, disconnectDB, mongoose };
