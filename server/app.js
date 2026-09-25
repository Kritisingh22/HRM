/* Express application (no DB connection / no listen here — see server.js).
 * Exporting the app this way lets the test suite mount it against an in-memory
 * MongoDB. */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cfg = require('./config/env');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security headers. script-src is now STRICT ('self' only) — the portal's
// scripts were externalised (public/portal-app.js + frontend-integration.js) and
// its inline onclick handlers converted to delegated listeners, so 'unsafe-inline'
// is no longer needed for scripts (M3 fix). style-src still allows inline styles
// (the portal uses many) plus Google Fonts; tightening styles is out of scope here.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors({ origin: cfg.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// API
app.use('/api', apiLimiter, apiRoutes);

// Serve the EXISTING portal frontend unchanged (public/). index.html is the portal.
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// SPA-ish fallback for non-API GETs → the portal
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (e) => { if (e) next(); });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
