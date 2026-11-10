/* Ticket — a Helpdesk request. */
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true, trim: true }
}, { _id: true, timestamps: true });

const ticketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, unique: true, index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, enum: ['IT', 'HR', 'Payroll', 'Facilities', 'Other'], default: 'Other' },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open', index: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    comments: { type: [commentSchema], default: [] }
  },
  { timestamps: true }
);

// auto-generate a readable ticket id
ticketSchema.pre('validate', async function (next) {
  if (!this.ticketId) {
    this.ticketId = 'TKT-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema);
