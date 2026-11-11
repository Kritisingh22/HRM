/* AttendanceSettings — singleton geofence / session config for the portal.
 * HR configures office lat/lng, radius, working hours, minimum active hours
 * for a full day, idle timeout and whether out-of-radius check-ins are
 * blocked or merely flagged. Stored in MongoDB so it survives deploys and
 * can be changed without a redeploy. One document (fixed _id) holds all values.
 */
'use strict';
const mongoose = require('mongoose');

const attendanceSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton', required: true },
    officeLat: { type: Number, default: null },
    officeLng: { type: Number, default: null },
    radiusMeters: { type: Number, default: 200 },
    workStart: { type: String, default: '09:00' }, // HH:mm
    workEnd: { type: String, default: '18:00' }, // HH:mm
    minActiveHours: { type: Number, default: 8 }, // hours for a full "present" day
    blockOutsideLocation: { type: Boolean, default: true },
    idleMinutes: { type: Number, default: 5 }, // no input → paused
    heartbeatIntervalSeconds: { type: Number, default: 30 },
    sessionTimeoutSeconds: { type: Number, default: 90 }, // no heartbeat → close at last heartbeat
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date },
  },
  { timestamps: false },
);

module.exports = mongoose.model('AttendanceSettings', attendanceSettingsSchema);
