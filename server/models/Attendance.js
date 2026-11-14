/* Attendance — one record per employee per day, extended with mandatory
 * check-in geolocation, active-time tracking and session heartbeats.
 *
 * checkIn / checkOut are kept as strings (HH:mm) for backward compatibility
 * with the existing register UI; the rich geo/IP/device metadata lives in
 * checkInDetail / checkOutDetail. activeSeconds / pausedSeconds are computed
 * by the SERVER from heartbeat sessions — never trusted from the client.
 * status reflects the day outcome: present / half-day / absent / outside-location.
 *
 * All check-in / check-out timestamps and the attendance DATE are minted by
 * the server clock in Asia/Kolkata (company reporting timezone). The browser
 * timestamp is stored only as clientTimestamp and is never treated as
 * authoritative. serverTimestamp is the authoritative clock.
 *
 * New fields (see plan items 2f):
 *  - checkInLocation: lat/lng/accuracy from the check-in fix, plus geofence distance/inRange.
 *  - checkOutLocation: lat/lng/accuracy from the check-out fix, plus geofence distance/inRange.
 *  - locationStatus: 'verified'/'outside'/'unknown' — stable status from the check-in fix.
 *  - lastState: the most recent heartbeat state ('active'|'paused') for quick lookup.
 *  - checkInAt: alias for the date+time the employee checked in (same as checkIn HH:mm).
 *  - checkOutAt: alias for the date+time the employee checked out (same as checkOut HH:mm).
 */
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // authenticated account that performed the action
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD' in Asia/Kolkata

    // ---- employee snapshot (denormalised for the UI, never trusted from client) ----
    employeeName: { type: String, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' }, // reporting timezone; defaults to India

    // ---- authoritative timestamps (minted by the server clock) ----
    serverTimestamp: { type: Date }, // authoritative clock at the latest check-in / check-out
    clientTimestamp: { type: Date }, // browser/device local timestamp at capture (never authoritative)

    // ---- check-in ----
    checkIn: { type: String }, // 'HH:mm' — kept for backward compatibility
    checkInType: { type: String, default: 'manual' }, // manual | wfh
    checkInDetail: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      ip: String,
      device: String, // user-agent snapshot
      capturedAt: Date,
    },

    // ---- check-out ----
    checkOut: { type: String }, // 'HH:mm' — kept for backward compatibility
    checkOutType: { type: String, default: 'manual' }, // manual
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
      verificationStatus: {
        type: String,
        enum: ['verified', 'failed', 'skipped'],
        default: 'skipped',
      }, // whether the GPS fix was obtained & whether it was in-range
    },

    // ---- computed durations ----
    workingHoursMinutes: { type: Number, default: 0, min: 0 }, // server-computed check-in -> check-out duration

    // ---- active-time tracking (server-computed from heartbeats) ----
    activeSeconds: { type: Number, default: 0, min: 0 },
    pausedSeconds: { type: Number, default: 0, min: 0 },
    lastHeartbeatAt: { type: Date },
    lastState: { type: String, enum: ['active', 'paused', 'checked-in', 'checked-out'] },

    // ---- check-in/out location metadata ----
    checkInLocation: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      distanceMeters: Number,
      inRange: Boolean,
    },
    checkOutLocation: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      distanceMeters: Number,
      inRange: Boolean,
    },
    locationStatus: {
      type: String,
      enum: ['verified', 'outside', 'unknown'],
      default: 'unknown',
    },

    // ---- check-in/out timestamps (aliases for the HH:mm fields) ----
    checkInAt: { type: String }, // HH:mm
    checkOutAt: { type: String }, // HH:mm

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
  { timestamps: true }, // createdAt / updatedAt
);

// One row per employee per day — the unique index prevents duplicate records
// even under concurrent check-in / check-out requests.
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ lastHeartbeatAt: 1 });
attendanceSchema.index({ user: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
