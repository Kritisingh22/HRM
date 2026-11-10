/* Project — a project with its members and tasks. */
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  status: { type: String, enum: ['To Do', 'In Progress', 'Done'], default: 'To Do' },
  due: { type: Date }
}, { _id: true, timestamps: true });

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true, trim: true, index: true }, // e.g. PRJ-001
    name: { type: String, required: true, trim: true },
    description: { type: String },
    status: { type: String, enum: ['Planning', 'Active', 'On Hold', 'Completed'], default: 'Planning', index: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    startDate: { type: Date },
    endDate: { type: Date },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    tasks: { type: [taskSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
