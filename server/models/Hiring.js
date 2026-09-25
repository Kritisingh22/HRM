/* Hiring — a job opening with its candidate pipeline. */
const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    stage: { type: String, enum: ['Applied', 'Screening', 'Interview', 'Offer', 'Selected', 'Rejected'], default: 'Applied' },
    source: { type: String }
  },
  { _id: true, timestamps: true }
);

const hiringSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, trim: true, index: true }, // e.g. JOB-101
    title: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    location: { type: String },
    openings: { type: Number, default: 1 },
    status: { type: String, enum: ['Open', 'On Hold', 'Closed'], default: 'Open', index: true },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    candidates: { type: [candidateSchema], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Hiring', hiringSchema);
