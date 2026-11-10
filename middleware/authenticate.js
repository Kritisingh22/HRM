/* Verifies the Bearer access token on protected routes and attaches the live
 * user (from the DB) to req.user. The identity ALWAYS comes from the verified
 * token + database — never from anything the client claims in the body. */
const { verifyAccessToken } = require('../utils/tokens');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

module.exports = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw ApiError.unauthorized('Missing or malformed Authorization header.');
  const token = header.slice(7).trim();

  let payload;
  try {
    payload = verifyAccessToken(token); // checks signature + expiry
  } catch (e) {
    if (e.name === 'TokenExpiredError') throw ApiError.unauthorized('Access token expired.');
    throw ApiError.unauthorized('Invalid access token.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists.');
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active.');

  req.user = user;           // trusted identity for the rest of the request
  req.auth = { userId: String(user._id), role: user.role };
  next();
});
