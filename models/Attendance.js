/* Attendance — one record per employee per day, extended with mandatory
 * check-in geolocation, active-time tracking and session heartbeats.
 *
 * checkIn / checkOut are kept as strings (HH:mm) for backward compatibility
 * with the existing register UI; the rich geo/IP/device metadata lives in
 * checkInDetail / checkOutDetail. activeSeconds / pausedSeconds are computed
 * by the SERVER from heartbeat sessions — never trusted from the client.
 * status reflects the day outcome: present / half-day / absent / outside-location.
 */
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'

    // ---- check-in (server-minted time) ----
    checkIn: { type: String }, // 'HH:mm' — kept for backward compat
    checkInDetail: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      ip: String,
      device: String, // user-agent snapshot
      capturedAt: Date,
    },

    // ---- check-out (server-minted time) ----
    checkOut: { type: String }, // 'HH:mm' — kept for backward compat
    checkOutDetail: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      ip: String,
      device: String,
      capturedAt: Date,
    },

    // ---- location of check-in (lat/lng, captured once at check-in, server-side) ----
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },

    // ---- active-time tracking (server-computed from heartbeats) ----
    activeSeconds: { type: Number, default: 0, min: 0 },
    pausedSeconds: { type: Number, default: 0, min: 0 },
    lastHeartbeatAt: { type: Date },

    // ---- sessions (heartbeat-derived segments) ----
    sessions: [
      {
        start: Date,
        end: Date,
        state: { type: String, enum: ['active', 'paused'] },
        reason: { type: String, enum: ['hidden', 'blur', 'idle', 'out-of-range', 'offline', 'check-in', 'check-out', 'resume'] },
      },
    ],

    // ---- status & geofence ----
    status: {
      type: String,
      enum: ['present', 'half-day', 'absent', 'outside-location', 'wfh', 'leave', 'halfday'],
      default: 'absent',
      index: true,
    },
    geofence: {
      inRange: { type: Boolean, default: true },
      distanceMeters: { type: Number },
    },

    // ---- consent ----
    consentGiven: { type: Boolean, default: false },
    consentAt: { type: Date },

    note: { type: String },
  },
  { timestamps: true },
);

// One row per employee per day — unique index preserves existing behaviour.
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ lastHeartbeatAt: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
