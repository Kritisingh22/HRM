/* To-Do API — strictly the caller's OWN tasks. The owning employee is resolved
 * from req.user (the verified token); an employee id in the body/query is ignored,
 * so one user can never read or change another user's tasks. */
const Todo = require('../models/Todo');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const today = () => new Date().toISOString().slice(0, 10);

async function me(user) {
  const emp = await Employee.findOne({ $or: [{ user: user._id }, { employeeId: user.employeeId }] }).select('_id');
  if (!emp) throw ApiError.badRequest('No employee record is linked to your account.');
  return emp;
}

/* GET /api/todos?date=YYYY-MM-DD | ?from=&to=&status= */
exports.list = catchAsync(async (req, res) => {
  const emp = await me(req.user);
  const q = { employee: emp._id };
  if (isDay(req.query.date)) q.date = req.query.date;
  else if (isDay(req.query.from) && isDay(req.query.to)) q.date = { $gte: req.query.from, $lte: req.query.to };
  if (['Pending', 'Completed'].includes(req.query.status)) q.status = req.query.status;
  const todos = await Todo.find(q).sort({ date: -1, createdAt: -1 }).limit(500);
  res.json({ count: todos.length, todos });
});

/* POST /api/todos */
exports.create = catchAsync(async (req, res) => {
  const emp = await me(req.user);
  const title = String(req.body.title || '').trim();
  if (!title) throw ApiError.badRequest('Task title is required.');
  const date = isDay(req.body.date) ? req.body.date : today();
  const todo = await Todo.create({
    employee: emp._id,
    title,
    notes: req.body.notes || '',
    date,
    history: [{ status: 'Pending' }],
  });
  res.status(201).json({ todo });
});

/* PUT /api/todos/:id — edit text and/or toggle status (owner only) */
exports.update = catchAsync(async (req, res) => {
  const emp = await me(req.user);
  const todo = await Todo.findOne({ _id: req.params.id, employee: emp._id });
  if (!todo) throw ApiError.notFound('Task not found.');
  if (req.body.title !== undefined) {
    const t = String(req.body.title).trim();
    if (!t) throw ApiError.badRequest('Task title cannot be empty.');
    todo.title = t;
  }
  if (req.body.notes !== undefined) todo.notes = req.body.notes;
  if (isDay(req.body.date)) todo.date = req.body.date;
  if (req.body.status !== undefined) {
    if (!['Pending', 'Completed'].includes(req.body.status)) throw ApiError.badRequest('Invalid status.');
    if (req.body.status !== todo.status) {
      todo.status = req.body.status;
      todo.completedAt = req.body.status === 'Completed' ? new Date() : undefined;
      todo.history.push({ status: req.body.status });
    }
  }
  await todo.save();
  res.json({ todo });
});

/* DELETE /api/todos/:id — owner only */
exports.remove = catchAsync(async (req, res) => {
  const emp = await me(req.user);
  const r = await Todo.deleteOne({ _id: req.params.id, employee: emp._id });
  if (!r.deletedCount) throw ApiError.notFound('Task not found.');
  res.json({ ok: true });
});
