/* Boots the server: connect to MongoDB, then listen. */
const app = require('./app');
const cfg = require('./config/env');
const { connectDB } = require('./config/database');
const { startScheduler, stopScheduler } = require('./scheduler');

(async () => {
  try {
    await connectDB();
    
    // Start background scheduler (reminders, overdue marking, etc.)
    startScheduler();
    
    // Bind explicitly to 0.0.0.0 so the platform-assigned port (Render sets
    // process.env.PORT dynamically) is reachable from outside the container.
    // The port always comes from process.env.PORT via cfg — never hardcoded.
    const server = app.listen(cfg.PORT, '0.0.0.0', () => {
      const { port } = server.address();
      // eslint-disable-next-line no-console
      console.log('Cyethack HR API + portal listening on 0.0.0.0:' + port + '  (' + cfg.NODE_ENV + ')');
    });

    server.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start HTTP server:', err.message);
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
    
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
})();
