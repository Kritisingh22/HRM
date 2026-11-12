/* Express application (no DB connection / no listen here — see server.js).
 * Exporting the app this way lets the test suite mount it against an in-memory
 * MongoDB. */
const path = require('path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const cfg = require('./config/env');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---- Resolve frontend dist directory ----
// Defaults to server/public (where client build output is copied).
// Override with FRONTEND_DIST env var if building elsewhere.
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, 'public');
const DIST_EXISTS = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

if (cfg.isProd && !DIST_EXISTS) {
  console.error(
    `FATAL: Frontend dist not found at ${FRONTEND_DIST}. ` +
    'Run the client build first (npm --prefix ../client run build) or set FRONTEND_DIST.'
  );
  process.exit(1);
}

// ---- Compression (gzip/brotli) ----
// Compresses all responses where the client advertises Accept-Encoding:
// gzip, deflate, or br (brotli). Critical for the ~600 KiB JS bundle and
// hashed assets on Render's free tier.
app.use(compression());

// ---- /health — instant 200, zero DB calls, no rate limiting ----
// Used by external keep-alive pingers to stop Render's free-tier instance
// from spinning down between requests. Placed before every other middleware
// so it never touches the database or the API rate limiter.
app.get('/health', (_req, res) => {
  res.type('json').status(200).send(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
});

// ---- Security headers ----
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
    hsts: {
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors({ origin: cfg.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---- Serve static files only in production when dist exists ----
if (DIST_EXISTS) {
  // Hashed assets (/assets/*): long-lived immutable cache
  // Vite emits fingerprinted filenames (e.g. index--9DK5DF0.js), so they can
  // safely be cached for a year with the immutable directive — browsers never
  // revalidate them, and the CDN / browser serves them from cache.
  app.use(
    '/assets',
    express.static(path.join(FRONTEND_DIST, 'assets'), {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    })
  );

  // Font files (/fonts/*): long-lived immutable cache. The self-hosted IBM Plex
  // font binaries in client/public/fonts are immutable and referenced directly
  // by the @font-face rules in client/index.html (plus the preload hint).
  app.use(
    '/fonts',
    express.static(path.join(FRONTEND_DIST, 'fonts'), {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    })
  );

  // Other static files (robots.txt, favicon.ico, manifest.json, llms.txt, ai-catalog.json, etc.)
  app.use(express.static(FRONTEND_DIST));
}

// API
app.use('/api', apiLimiter, apiRoutes);

// ---- SPA fallback — index.html with no-cache ----
// The HTML itself must always revalidate so deploys pick up the new asset
// hashes. Hashed assets inside it are cached immutably (see /assets above).
// Only serves index.html for GET requests to non-API paths without file extensions.
// Uploaded files (payslips, documents) are NOT served here: they are private and
// streamed only through the authenticated download routes (documentRoutes,
// employeeDocumentRoutes, payrollRoutes) after object-level authorization.
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();

  // Paths with file extensions (.txt, .json, .html, etc.) are served by
  // express.static or should return 404 — never fall through to the SPA index.html.
  // This prevents /llms.txt and /ai-catalog.json from returning the SPA shell.
  if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
    return res.status(404).type('text').send('Not found');
  }

  if (!DIST_EXISTS) {
    // Dev shell when the frontend build output has not been (re)generated.
    // server/public is build output (gitignored, cleaned on checkout) — the
    // portal becomes fully functional once `npm --prefix ../client run build`
    // has run and the server is restarted.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cyethack HRM Portal</title></head>' +
      '<body><h2>Cyethack HRM Portal</h2><p>The frontend build output (server/public) is missing.</p>' +
      '<p>Run <code>npm --prefix ../client run build</code> (or set FRONTEND_DIST) and restart the server.</p>' +
      '<p>API endpoints remain available under <code>/api</code>.</p></body></html>',
    );
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (e) => { if (e) next(); });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
