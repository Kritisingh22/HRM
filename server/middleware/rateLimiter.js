/* Rate limiters. The login limiter blunts brute-force guessing at the IP level;
 * per-account lockout (in the auth controller) handles the targeted case. */
const rateLimit = require('express-rate-limit');
const cfg = require('../config/env');

const skipInTest = () => process.env.NODE_ENV === 'test';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 20,                         // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many login attempts from this address. Please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many requests. Please slow down.' }
});

// Bootstrap-admin is a one-time, security-sensitive endpoint. The SETUP_TOKEN is
// the real protection; this limiter is defence-in-depth, capping how fast anyone
// can probe the endpoint (e.g. guessing the token after a database reset).
const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 hour
  max: 10,                          // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many bootstrap attempts from this address. Please try again later.' }
});

// Uploads move real bytes to object storage — cap them per authenticated user
// (falling back to per-IP for anonymous requests, which the API rejects anyway).
const uploadLimiter = rateLimit({
  windowMs: Math.max(1, cfg.UPLOAD_RATE_WINDOW_MIN) * 60 * 1000,
  max: Math.max(1, cfg.UPLOAD_RATE_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  keyGenerator: (req) =>
    req.user && req.user._id ? 'user:' + String(req.user._id) : (rateLimit.ipKeyGenerator ? rateLimit.ipKeyGenerator(req) : req.ip),
  message: { error: 'Too many document uploads. Please wait a few minutes and try again.' }
});

module.exports = { loginLimiter, apiLimiter, bootstrapLimiter, uploadLimiter };
