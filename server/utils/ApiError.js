/* A typed error carrying an HTTP status code, so controllers can throw and the
 * central error handler can format a safe response. */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(msg, d) { return new ApiError(400, msg || 'Bad request', d); }
  static unauthorized(msg) { return new ApiError(401, msg || 'Not authenticated'); }
  static forbidden(msg) { return new ApiError(403, msg || 'You do not have permission to perform this action.'); }
  static notFound(msg) { return new ApiError(404, msg || 'Not found'); }
  static conflict(msg) { return new ApiError(409, msg || 'Conflict'); }
  static locked(msg) { return new ApiError(423, msg || 'Account locked'); }
}
module.exports = ApiError;
