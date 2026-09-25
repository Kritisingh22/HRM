/* Central error handler — returns safe JSON. Never leaks stack traces, Mongo
 * errors, or internal details to clients. Logs the real error server-side. */
const cfg = require('../config/env');
const ApiError = require('../utils/ApiError');

// 404 for unmatched API routes
function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) return next(new ApiError(404, 'Route not found.'));
  next();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // translate common Mongoose/Mongo errors into safe messages
  if (err.name === 'ValidationError') { status = 400; message = 'Validation failed.'; details = Object.values(err.errors).map((e) => e.message); }
  else if (err.name === 'CastError') { status = 400; message = 'Invalid identifier.'; }
  else if (err.code === 11000) { status = 409; message = 'That record already exists.'; }

  if (status >= 500) {
    // log full detail server-side only
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    if (cfg.isProd) message = 'Something went wrong. Please try again later.';
  }

  res.status(status).json({ error: message, ...(details ? { details } : {}) });
}

module.exports = { notFound, errorHandler };
