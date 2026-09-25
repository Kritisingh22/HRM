/* Boots the server: connect to MongoDB, then listen. */
const app = require('./app');
const cfg = require('./config/env');
const { connectDB } = require('./config/database');
<<<<<<< HEAD
=======
const { startScheduler, stopScheduler } = require('./scheduler');
>>>>>>> 0f31467 (intial Update HRM 1.1)

(async () => {
  try {
    await connectDB();
<<<<<<< HEAD
    app.listen(cfg.PORT, () => {
      // eslint-disable-next-line no-console
      console.log('Cyethack HR API + portal running: http://localhost:' + cfg.PORT + '  (' + cfg.NODE_ENV + ')');
    });
=======
    
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
    
>>>>>>> 0f31467 (intial Update HRM 1.1)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
})();
