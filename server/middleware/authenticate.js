/* Verifies the Bearer access token on protected routes and attaches the live
 * user (from the DB) to req.user. The identity ALWAYS comes from the verified
 * token + database — never from anything the client claims in the body.
 *
 * Selects only the fields needed downstream (_id, employeeId, role, status)
 * and uses .lean() to avoid Mongoose document hydration overhead.
 *
 * Mandatory password change enforcement: when a user's account has
 * mustChangePassword = true (e.g. after an admin-initiated reset or a
 * temporary-password login), access is restricted to only the change-password
 * and logout endpoints. Every other protected route is blocked with 403.
 */
const { verifyAccessToken } = require('../utils/tokens');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/* Paths that a user with mustChangePassword=true is allowed to access. */
const ALLOWED_MUST_CHANGE_PATHS = [
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/me', // needed so the frontend can read the mustChangePassword flag
];

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

  const user = await User.findById(payload.sub).select('_id employeeId role status mustChangePassword').lean();
  if (!user) throw ApiError.unauthorized('User no longer exists.');
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active.');

  /* Mandatory password change: restrict to change-password / logout / me only. */
  if (user.mustChangePassword) {
    const isChangePassword = req.path === '/change-password';
    const isLogout = req.path === '/logout';
    const isMe = req.path === '/me';
    if (!(isChangePassword || isLogout || isMe)) {
      throw ApiError.forbidden('You must change your password before accessing other features. Please use the change-password endpoint.');
    }
  }

  req.user = user;           // trusted identity for the rest of the request
  req.auth = { userId: String(user._id), role: user.role, mustChangePassword: user.mustChangePassword };
  next();
});
