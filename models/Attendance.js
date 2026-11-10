/* Attendance — one record per employee per day. */
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    status: { type: String, enum: ['present', 'absent', 'halfday', 'wfh', 'leave'], default: 'present' },
    checkIn: { type: String },
    checkOut: { type: String },
    note: { type: String }
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
