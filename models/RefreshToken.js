/* RefreshToken — supports refresh-token ROTATION, REVOCATION, reuse-detection
 * and logout. Only the SHA-256 hash of the token is stored (never the raw
 * value). Tokens issued from the same login share a `family`; if a revoked
 * token is ever replayed, the whole family is revoked (stolen-token defence). */
const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
    replacedByHash: { type: String, default: null },
    userAgent: { type: String },
    ip: { type: String }
  },
  { timestamps: true }
);

// TTL index: expired tokens are removed automatically by MongoDB.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
