/* User — the authentication identity. Never stores a plaintext password;
 * only a bcrypt hash (and that field is not selected by default). */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cfg = require("../config/env");
const { ROLES } = require("../utils/permissions");

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true, sparse: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false }, // never sent to clients
    role: { type: String, enum: ROLES, default: "EMPLOYEE", index: true },
    // Granular permissions: array of "module:action" strings (e.g., "leave:approve", "payroll:read")
    // Overrides/adds to role-based permissions. Empty = use role defaults only.
    permissions: { type: [String], default: [], index: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // for MANAGER-scoped access
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
      index: true,
    },
    isVerified: { type: Boolean, default: true },
    accountStatus: {
      type: String,
      enum: ['pending-activation', 'active', 'suspended'],
      default: 'pending-activation',
      index: true,
    }, // new hires start pending-activation until first login sets a password
    mustChangePassword: { type: Boolean, default: false }, // forces password reset on next login
    activationToken: { type: String, select: false }, // hashed one-time activation token
    activationTokenExpires: { type: Date, select: false },
    // Password reset / one-time setup (admin-initiated). Only the SHA-256 hash
    // of the token is stored; the raw value is delivered out-of-band once and
    // never logged or returned after creation.
    passwordResetToken: { type: String, select: false }, // hashed temp/reset token
    passwordResetExpires: { type: Date, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true },
);

// Virtual setter: assign `user.password = '...'` and it is hashed on save.
userSchema.virtual("password").set(function (plain) {
  this._plainPassword = plain;
});

// Hash in pre('validate') so passwordHash exists before the "required" check runs.
userSchema.pre("validate", async function (next) {
  if (this._plainPassword) {
    this.passwordHash = await bcrypt.hash(
      this._plainPassword,
      cfg.BCRYPT_ROUNDS,
    );
    this._plainPassword = undefined;
  }
  next();
});

userSchema.methods.comparePassword = async function (plain) {
  if (
    typeof plain !== "string" ||
    plain.length === 0 ||
    typeof this.passwordHash !== "string" ||
    this.passwordHash.length === 0
  ) {
    return false;
  }
  try {
    return await bcrypt.compare(plain, this.passwordHash);
  } catch (error) {
    return false;
  }
};
userSchema.methods.isLocked = function () {
  return !!(
    this.accountLockedUntil && this.accountLockedUntil.getTime() > Date.now()
  );
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
    accountStatus: this.accountStatus,
    mustChangePassword: this.mustChangePassword,
    permissions: this.permissions || [],
  };
};

module.exports = mongoose.model("User", userSchema);
