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

const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, 'public');
const DIST_EXISTS = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

if (cfg.isProd && !DIST_EXISTS) {
  console.error(`FATAL: Frontend dist not found at ${FRONTEND_DIST}`);
  process.exit(1);
}

app.use(compression());
app.use(helmet({
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
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false
});
app.use(cors({ origin: cfg.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

if (DIST_EXISTS) {
  app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets'), { setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
  app.use('/fonts', express.static(path.join(FRONTEND_DIST, 'fonts'), { setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
  app.use(express.static(FRONTEND_DIST));
}

app.get('/health', (_req, res) => {
  res.type('json').status(200).send(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
});

app.use('/api', apiLimiter, apiRoutes);

app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (/\.[a-zA-Z0-9]+$/.test(req.path)) { return res.status(404).type('text').send('Not found'); }
  if (!DIST_EXISTS) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cyethack HRM Portal</title></head><body><h2>Cyethack HRM Portal</h2><p>The frontend build output is missing.</p><p>API endpoints remain available under /api.</p></body></html>');
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (e) => { if (e) next(); });
});

app.use(notFound);
app.use(errorHandler);

try {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
} catch (e) {
  console.error('Failed to start server:', e.message);
}