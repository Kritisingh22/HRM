/* User — the authentication identity. Never stores a plaintext password;
 * only a bcrypt hash (and that field is not selected by default). */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cfg = require('../config/env');
const { ROLES } = require('../utils/permissions');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true, sparse: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false }, // never sent to clients
    role: { type: String, enum: ROLES, default: 'EMPLOYEE', index: true },
    // Granular permissions: array of "module:action" strings (e.g., "leave:approve", "payroll:read")
    // Overrides/adds to role-based permissions. Empty = use role defaults only.
    permissions: { type: [String], default: [], index: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // for MANAGER-scoped access
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
    isVerified: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null }
  },
  { timestamps: true }
);

// Virtual setter: assign `user.password = '...'` and it is hashed on save.
userSchema.virtual('password').set(function (plain) { this._plainPassword = plain; });

// Hash in pre('validate') so passwordHash exists before the "required" check runs.
userSchema.pre('validate', async function (next) {
  if (this._plainPassword) {
    this.passwordHash = await bcrypt.hash(this._plainPassword, cfg.BCRYPT_ROUNDS);
    this._plainPassword = undefined;
  }
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};
userSchema.methods.isLocked = function () {
  return !!(this.accountLockedUntil && this.accountLockedUntil.getTime() > Date.now());
};

// A response-safe projection — never leaks passwordHash or lockout internals.
userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    employeeId: this.employeeId,
    name: this.fullName,
    email: this.email,
    role: this.role,
    department: this.department,
    designation: this.designation,
    status: this.status,
    permissions: this.permissions || []
  };
};

module.exports = mongoose.model('User', userSchema);
