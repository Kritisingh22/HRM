/* JWT access tokens + opaque refresh tokens.
 *
 * Access token: short-lived JWT (default 15m), signed with JWT_SECRET, minimal
 *   payload { sub, role }. Sent to the client and presented as a Bearer header.
 * Refresh token: a high-entropy random string (NOT a JWT). Only its SHA-256
 *   hash is stored in the database, so a database leak does not expose usable
 *   tokens. The raw value lives only in an httpOnly cookie. Rotation and
 *   revocation are handled in the auth controller against the RefreshToken model.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cfg = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role },
    cfg.JWT_SECRET,
    { expiresIn: cfg.ACCESS_TOKEN_EXPIRES_IN }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, cfg.JWT_SECRET); // throws on invalid/expired
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// parse a "7d" / "15m" style string into milliseconds (for cookie maxAge / expiry)
function ttlToMs(ttl) {
  const m = String(ttl).match(/^(\d+)\s*([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 })[m[2]];
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken, ttlToMs };
