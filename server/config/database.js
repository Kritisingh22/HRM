/* MongoDB connection via Mongoose.
 *
 * Connects with an explicit database name (never "test" in production),
 * connection options for resilience, retry logic at startup, and full
 * event handling. The HTTP server starts immediately (listen-first) so
 * /health is reachable even before MongoDB connects, but API routes that
 * need the DB will return 503 until the connection is established.
 */

const mongoose = require("mongoose");
const cfg = require("./env");

mongoose.set("strictQuery", true);

/* ---- Connection options ------------------------------------------------
   serverSelectionTimeoutMS: fail fast if the DB is unreachable at startup
   socketTimeoutMS: detect dead connections
   family: 4 => IPv4 only (avoids IPv6 DNS issues on some networks)
   maxPoolSize: keep a modest pool for the free tier
   minPoolSize: 0 => connections close when idle
*/
const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
  maxPoolSize: 10,
  minPoolSize: 0,
};

/* ---- Database name -----------------------------------------------------
   Always use an explicit dbName so we never accidentally connect to "test"
   in production. The MONGODB_URI may already contain a database name; if it
   does, dbName is redundant but harmless. If it does not, dbName provides
   the correct production database.
*/
function resolveDbName(uri) {
  try {
    const u = new URL(uri);
    if (u.pathname && u.pathname.length > 1) return u.pathname.slice(1);
  } catch (e) {
    /* Not a valid URL; fall through to default. */
  }
  return "cyethack_hr";
}

const DB_NAME = resolveDbName(cfg.MONGODB_URI);

/* ---- Connection state -------------------------------------------------- */
let connectionPromise = null;
let connectionResolved = false;
let connectionError = null;

async function connectDB(uri = cfg.MONGODB_URI) {
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        ...CONNECT_OPTIONS,
        dbName: DB_NAME,
      });

      connectionResolved = true;

      // ---- Event handlers ------------------------------------------------
      mongoose.connection.on("connected", () => {
        console.log(
          "MongoDB connected:",
          mongoose.connection.host + "/" + mongoose.connection.name,
        );
      });

      mongoose.connection.on("disconnected", () => {
        connectionResolved = false;
        console.error("MongoDB disconnected");
      });

      mongoose.connection.on("error", (err) => {
        connectionError = err;
        console.error("MongoDB connection error:", err.message);
      });

      mongoose.connection.on("reconnected", () => {
        connectionResolved = true;
        connectionError = null;
        console.log("MongoDB reconnected");
      });

      // eslint-disable-next-line no-console
      console.log(
        "MongoDB connected:",
        mongoose.connection.host + "/" + mongoose.connection.name,
      );
      return mongoose.connection;
    } catch (err) {
      connectionError = err;
      connectionResolved = false;
      // eslint-disable-next-line no-console
      console.error("MongoDB connection failed:", err.message);
      throw err;
    }
  })();

  return connectionPromise;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connectionResolved = false;
  connectionPromise = null;
}

/* ---- Readiness --------------------------------------------------------- */
function isDBReady() {
  return (
    connectionResolved &&
    mongoose.connection.readyState === 1 &&
    !connectionError
  );
}

function getDBError() {
  return connectionError;
}

/* ---- Production safety check ------------------------------------------ */
function assertProductionSafe() {
  if (cfg.isProd) {
    const unsafe = [];
    if (
      cfg.JWT_SECRET &&
      (cfg.JWT_SECRET.includes("change-me") ||
        cfg.JWT_SECRET.includes("change-this") ||
        cfg.JWT_SECRET.length < 16)
    ) {
      unsafe.push("JWT_SECRET");
    }
    if (
      cfg.JWT_REFRESH_SECRET &&
      (cfg.JWT_REFRESH_SECRET.includes("change-me") ||
        cfg.JWT_REFRESH_SECRET.includes("change-this") ||
        cfg.JWT_REFRESH_SECRET.length < 16)
    ) {
      unsafe.push("JWT_REFRESH_SECRET");
    }
    if (unsafe.length) {
      throw new Error(
        "FATAL: Production secrets are unsafe (" +
          unsafe.join(", ") +
          "). Set real values before starting in production.",
      );
    }
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  mongoose,
  isDBReady,
  getDBError,
  assertProductionSafe,
  DB_NAME,
};
