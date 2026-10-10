/* Todo — an employee's personal daily task. Always owned by exactly one Employee;
 * the owner is taken from the authenticated session, never from the request body. */
const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 1000 },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD' the task is planned for
    status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending', index: true },
    completedAt: { type: Date },
    // history of status changes, so completion history is retained
    history: {
      type: [{ status: String, at: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
  },
  { timestamps: true }
);
todoSchema.index({ employee: 1, date: 1 });

module.exports = mongoose.model('Todo', todoSchema);
