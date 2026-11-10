/* ===========================================================================
 * Vercel serverless entry point.
 *
 * On a traditional host, server.js connects to MongoDB once and then keeps the
 * process alive (app.listen). Vercel instead runs this file as a serverless
 * function, so there is no long-lived process to hold the connection. This
 * wrapper reuses one Mongo connection across "warm" invocations and only makes
 * API requests wait for the database — the portal's static files (index.html,
 * portal-app.js, …) are served straight away, even on a cold start.
 *
 * The existing Express app (../app) is mounted unchanged, so all of its
 * behaviour — routing, RBAC, helmet/CSP, the httpOnly refresh cookie — is
 * preserved exactly. Nothing in the app's own code needs to know it is running
 * on Vercel.
 * ========================================================================= */
const express = require('express');
const mongoose = require('mongoose');
const app = require('../app');
const { connectDB } = require('../config/database');

// Reuse a single connection attempt across invocations of the same warm
// instance. If a connection attempt fails, drop it so the next request retries.
let connecting = null;
function ensureDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    connecting = connectDB().catch((err) => {
      connecting = null;
      throw err;
    });
  }
  return connecting;
}

const handler = express();
handler.set('trust proxy', 1);

// Gate only the API on the database being ready. This middleware never reads the
// request body, so Express's own body parser (inside ../app) still receives the
// untouched stream.
handler.use(async (req, res, next) => {
  if ((req.url || '').startsWith('/api/')) {
    try {
      await ensureDB();
    } catch (err) {
      res.status(503).json({ error: 'The service is starting up. Please try again in a moment.' });
      return;
    }
  }
  next();
});

handler.use(app);

module.exports = handler;
