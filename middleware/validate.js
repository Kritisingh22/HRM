/* Collects express-validator results and returns a 400 with safe messages. */
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(ApiError.badRequest('Validation failed.', details));
  }
  next();
};
