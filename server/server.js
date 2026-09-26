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
    
    const server = app.listen(cfg.PORT, () => {
      // eslint-disable-next-line no-console
      console.log('Cyethack HR API + portal running: http://localhost:' + cfg.PORT + '  (' + cfg.NODE_ENV + ')');
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
