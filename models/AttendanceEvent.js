/* AttendanceEvent — one pause/resume/lifecycle event in an attendance day.
 * Written server-side from heartbeats, pause requests and check-in/out.
 * Never written by the client; the client only reports state via heartbeats.
 */
'use strict';
const mongoose = require('mongoose');

const attendanceEventSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    type: {
      type: String,
      enum: ['pause', 'resume', 'check-in', 'check-out', 'offline'],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ['hidden', 'blur', 'idle', 'out-of-range', 'offline', 'check-in', 'check-out', 'resume'],
      required: true,
    },
    at: { type: Date, required: true, index: true }, // server-minted timestamp
    details: mongoose.Schema.Types.Mixed, // e.g. { state, gapSeconds, distanceMeters }
  },
  { timestamps: false },
);

attendanceEventSchema.index({ employee: 1, date: 1, at: -1 });

module.exports = mongoose.model('AttendanceEvent', attendanceEventSchema);
