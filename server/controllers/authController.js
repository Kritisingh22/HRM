/* Authentication: login, refresh (with rotation + reuse detection), logout,
 * and the current-user endpoint. */
const cfg = require('../config/env');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const crypto = require('crypto');
const {
  signAccessToken, generateRefreshToken, hashToken, ttlToMs
} = require('../utils/tokens');
const { permissionsFor } = require('../utils/permissions');
const { navFor, portalFor } = require('../utils/navigation');

const REFRESH_MS = ttlToMs(cfg.REFRESH_TOKEN_EXPIRES_IN);

// Fixed bcrypt hash used to equalize login timing when the email is unknown, so an
// attacker cannot tell "no such user" from "wrong password" by response time.
const bcrypt = require('bcryptjs');
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('cyethack-timing-equalizer', cfg.BCRYPT_ROUNDS);

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: cfg.isProd,          // HTTPS-only in production
    path: '/api/auth'            // cookie is only sent to the auth routes
  };
}
function refreshCookieOptions() { return { ...baseCookieOptions(), maxAge: REFRESH_MS }; }
function clearCookieOptions() { return baseCookieOptions(); } // no maxAge on clear

// Constant-time secret comparison. Both inputs are SHA-256'd to a fixed 32-byte
// digest before timingSafeEqual, so the comparison time reveals neither the
// secret's contents nor its length (timingSafeEqual itself requires equal-length
// buffers — hashing first guarantees that without an early length-based return).
function timingSafeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// issue a fresh refresh token (optionally within an existing rotation family)
async function issueRefreshToken(user, req, family) {
  const raw = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(raw),
    family: family || crypto.randomUUID(),
    expiresAt: new Date(Date.now() + REFRESH_MS),
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  return raw;
}

function sendSession(res, user, rawRefresh) {
  res.cookie(cfg.COOKIE_NAME, rawRefresh, refreshCookieOptions());
  // Merge role permissions with user-specific permissions (user perms ADD to role perms)
  const rolePerms = permissionsFor(user.role);
  const userPerms = user.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...userPerms])];
  return {
    accessToken: signAccessToken(user),
    expiresIn: cfg.ACCESS_TOKEN_EXPIRES_IN,
    user: { ...user.toSafeJSON(), permissions: allPerms, nav: navFor(user.role), portal: portalFor(user.role) }
  };
}

/* POST /api/auth/login */
exports.login = catchAsync(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw ApiError.badRequest('Email and password are required.');

  const user = await User.findOne({ email }).select('+passwordHash');

  // account lock check (only meaningful when the user exists)
  if (user && user.isLocked()) {
    throw ApiError.locked('Account temporarily locked due to failed attempts. Try again later.');
  }

  let passwordOk = false;
  if (user) {
    passwordOk = await user.comparePassword(password);
  } else {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH); // constant-time equalizer; result discarded
  }

  if (!user || !passwordOk) {
    if (user) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= cfg.MAX_FAILED_LOGINS) {
        user.accountLockedUntil = new Date(Date.now() + cfg.ACCOUNT_LOCK_MINUTES * 60000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
    }
    throw ApiError.unauthorized('Invalid email or password.'); // generic — no enumeration
  }

  if (user.status !== 'active') throw ApiError.forbidden('This account is not active. Contact your administrator.');

  // success: reset counters, record login
  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  user.lastLogin = new Date();
  await user.save();

  const raw = await issueRefreshToken(user, req);
  res.json(sendSession(res, user, raw));
});

/* POST /api/auth/refresh — rotates the refresh token and returns a new access token */
exports.refresh = catchAsync(async (req, res) => {
  const raw = req.cookies[cfg.COOKIE_NAME];
  if (!raw) throw ApiError.unauthorized('No refresh token.');

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(raw) });

  // unknown or expired token
  if (!stored || stored.expiresAt.getTime() < Date.now()) {
    res.clearCookie(cfg.COOKIE_NAME, clearCookieOptions());
    throw ApiError.unauthorized('Refresh token is invalid or expired.');
  }

  // REUSE DETECTION: a revoked token being replayed means it may be stolen —
  // revoke the entire family so the attacker's chain is dead too.
  if (stored.revoked) {
    await RefreshToken.updateMany({ family: stored.family }, { revoked: true });
    res.clearCookie(cfg.COOKIE_NAME, clearCookieOptions());
    throw ApiError.unauthorized('Refresh token has been revoked.');
  }

  const user = await User.findById(stored.user);
  if (!user || user.status !== 'active') {
    res.clearCookie(cfg.COOKIE_NAME, clearCookieOptions());
    throw ApiError.unauthorized('Session is no longer valid.');
  }

  // rotate: issue a new token in the same family, mark the old one replaced+revoked
  const newRaw = await issueRefreshToken(user, req, stored.family);
  stored.revoked = true;
  stored.replacedByHash = hashToken(newRaw);
  await stored.save();

  res.json(sendSession(res, user, newRaw));
});

/* POST /api/auth/logout — revokes the current refresh token and clears the cookie */
exports.logout = catchAsync(async (req, res) => {
  const raw = req.cookies[cfg.COOKIE_NAME];
  if (raw) {
    const stored = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
    if (stored) { await RefreshToken.updateMany({ family: stored.family }, { revoked: true }); }
  }
  res.clearCookie(cfg.COOKIE_NAME, clearCookieOptions());
  res.json({ ok: true, message: 'Logged out successfully.' });
});

/* GET /api/auth/me — restore the authenticated session */
exports.me = catchAsync(async (req, res) => {
  const rolePerms = permissionsFor(req.user.role);
  const userPerms = req.user.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...userPerms])];
  res.json({ user: { ...req.user.toSafeJSON(), permissions: allPerms, nav: navFor(req.user.role), portal: portalFor(req.user.role) } });
});

/* POST /api/auth/change-password — the logged-in user changes their own password.
 * Verifies the current password, sets the new one (hashed), and revokes all this
 * user's refresh tokens so other sessions must sign in again. */
exports.changePassword = catchAsync(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!currentPassword || !newPassword) throw ApiError.badRequest('currentPassword and newPassword are required.');
  if (newPassword.length < 8) throw ApiError.badRequest('New password must be at least 8 characters.');

  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect.');

  user.password = newPassword;   // hashed on save
  await user.save();
  await RefreshToken.updateMany({ user: user._id }, { revoked: true }); // force re-login elsewhere
  res.clearCookie(cfg.COOKIE_NAME, clearCookieOptions());
  res.json({ ok: true, message: 'Password changed. Please sign in again.' });
});

/* POST /api/auth/bootstrap-admin — creates the FIRST admin account. Requires BOTH
 * (1) a valid one-time SETUP_TOKEN (from env, supplied as the X-Setup-Token header
 * or a setupToken body field) AND (2) an empty user store. This closes the M4 gap
 * where an empty database alone (e.g. after a reset) allowed unauthenticated admin
 * creation. If SETUP_TOKEN is unset, bootstrap is disabled entirely. */
exports.bootstrapAdmin = catchAsync(async (req, res) => {
  const provided = req.get('x-setup-token') || req.body.setupToken || '';
  // Require a valid SETUP_TOKEN using a constant-time comparison. An unset token
  // disables bootstrap entirely. This check runs FIRST so an unauthorised caller
  // learns nothing about the database state (e.g. whether it is empty).
  if (!cfg.SETUP_TOKEN || !timingSafeEqualStr(provided, cfg.SETUP_TOKEN)) {
    throw ApiError.forbidden('Bootstrap requires a valid setup token.');
  }
  const count = await User.countDocuments();
  if (count > 0) throw ApiError.forbidden('Bootstrap is disabled: users already exist.');

  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) throw ApiError.badRequest('fullName, email and password are required.');
  if (String(password).length < 8) throw ApiError.badRequest('Password must be at least 8 characters.');

  const user = new User({ fullName, email: String(email).toLowerCase(), role: 'ADMIN', status: 'active', isVerified: true });
  user.password = password;
  await user.save();
  res.status(201).json({ ok: true, message: 'First admin created. You can now log in.', user: user.toSafeJSON() });
});
