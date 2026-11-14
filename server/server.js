/* Boots the server: listen FIRST, then connect to MongoDB in the background.
 *
 * The HTTP server (and therefore GET /health and the static frontend shell,
 * index.html included) must become reachable immediately on a cold start and
 * must never wait for MongoDB. /health is a zero-DB endpoint used by uptime
 * pings to keep Render's free-tier instance from spinning down; if boot is
 * blocked on connectDB(), a cold-start ping can time out while the instance
 * is still starting, which breaks keep-alive and shows up in Lighthouse as
 * "NO_NAVSTART / page loaded too slowly".
 *
 * API routes that need the database simply return errors until MongoDB
 * connects (and mongoose retries automatically), so the portal shell and
 * /health stay up even when the database is slow or temporarily unreachable.
 *
 * Production safety: refuse to start with placeholder secrets
 * (change-me-*, change-this-*, or < 16 chars).
 */
const app = require('./app');
const cfg = require('./config/env');
const { connectDB, mongoose, assertProductionSafe } = require('./config/database');
const { startScheduler, stopScheduler } = require('./scheduler');
const { initSocketIO } = require('./utils/socketHandler');

const start = async () => {
  // ---- Production safety check: refuse to start with unsafe secrets -----
  assertProductionSafe();

  // Bind explicitly to 0.0.0.0 so the platform-assigned port (Render sets
  // process.env.PORT dynamically) is reachable from outside the container.
  // The port always comes from process.env.PORT via cfg — never hardcoded.
  const server = app.listen(cfg.PORT, '0.0.0.0', () => {
    const { port } = server.address();
    // eslint-disable-next-line no-console
    console.log('Cyethack HR API + portal listening on 0.0.0.0:' + port + '  (' + cfg.NODE_ENV + ')');

    // Initialize Socket.IO on the same HTTP server.
    initSocketIO(server);
    // eslint-disable-next-line no-console
    console.log('Socket.IO initialized on port ' + port);
  });

  server.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start HTTP server:', err.message);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down gracefully...');
    stopScheduler();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // MongoDB connects in the background — never blocks the HTTP server.
  // The scheduler (which needs the DB) starts only after a successful connect.
  // DB errors are logged, never fatal: /health and the portal shell must keep
  // serving even when MongoDB is slow or temporarily unreachable.
  connectDB()
    .then(() => {
      startScheduler();
      // eslint-disable-next-line no-console
      console.log('MongoDB connected; background scheduler started.');
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        'MongoDB connection failed:',
        err.message,
        '- /health and the portal shell still serve; API routes needing the DB will error until MongoDB recovers.',
      );
    });
  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection error:', err.message, '- portal shell and /health still serving.');
  });
};

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start:', err.message);
  process.exit(1);
});
