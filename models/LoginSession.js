/* LoginSession — one record per login. Tracks login/logout time, session
 * duration, and (optional, permission-gated on the client) GPS captured at
 * login/check-in. All timestamps and duration are computed on the SERVER —
 * the frontend never supplies loginAt/logoutAt/duration, only optional GPS
 * coordinates, so a client can never fake or skew working-time numbers. */
const mongoose = require('mongoose');

const gpsSchema = new mongoose.Schema(
  {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },        // meters, as reported by the browser
    capturedAt: { type: Date }
  },
  { _id: false }
);

const loginSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeId: { type: String, trim: true, index: true },
    role: { type: String, required: true },

    loginAt: { type: Date, required: true, default: Date.now },
    logoutAt: { type: Date, default: null },
    // Duration in whole seconds, set ONLY at logout (server clock on both ends).
    durationSeconds: { type: Number, default: null },

    status: { type: String, enum: ['Active', 'LoggedOut'], default: 'Active', index: true },

    gps: { type: gpsSchema, default: null },

    ip: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

loginSessionSchema.index({ user: 1, status: 1 });

// Live duration for an in-progress session: server time minus login time.
// Never derived from anything the client sends.
loginSessionSchema.methods.liveDurationSeconds = function () {
  const end = this.logoutAt || new Date();
  return Math.max(0, Math.floor((end.getTime() - this.loginAt.getTime()) / 1000));
};

loginSessionSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    employeeId: this.employeeId,
    role: this.role,
    loginAt: this.loginAt,
    logoutAt: this.logoutAt,
    status: this.status,
    durationSeconds: this.status === 'Active' ? this.liveDurationSeconds() : this.durationSeconds,
    gps: this.gps || null
  };
};

module.exports = mongoose.model('LoginSession', loginSessionSchema);
