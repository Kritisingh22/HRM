/* Hiring API — job openings + candidate pipeline. Read requires hiring:read
 * (HR/Admin/Super); write/delete require hiring:write / hiring:delete. Regular
 * employees have no hiring permission and are rejected by the route guards. */
const Hiring = require('../models/Hiring');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/* GET /api/hiring */
exports.list = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const jobs = await Hiring.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ count: jobs.length, hiring: jobs });
});

/* GET /api/hiring/:id */
exports.getOne = catchAsync(async (req, res) => {
  const job = await findJob(req.params.id);
  if (!job) throw ApiError.notFound('Job opening not found.');
  res.json({ job });
});

/* POST /api/hiring (hiring:write) */
exports.create = catchAsync(async (req, res) => {
  const { jobId, title } = req.body;
  if (!jobId || !title) throw ApiError.badRequest('jobId and title are required.');
  const job = await Hiring.create({ ...pick(req.body), createdBy: req.user._id });
  res.status(201).json({ job });
});

/* PUT /api/hiring/:id (hiring:write) */
exports.update = catchAsync(async (req, res) => {
  const job = await findJob(req.params.id);
  if (!job) throw ApiError.notFound('Job opening not found.');
  Object.assign(job, pick(req.body));
  await job.save();
  res.json({ job });
});

/* DELETE /api/hiring/:id (hiring:delete) */
exports.remove = catchAsync(async (req, res) => {
  const job = await findJob(req.params.id);
  if (!job) throw ApiError.notFound('Job opening not found.');
  await job.deleteOne();
  res.json({ ok: true });
});

function pick(b) {
  const allow = ['jobId', 'title', 'department', 'location', 'openings', 'status', 'description', 'candidates'];
  const out = {}; allow.forEach((k) => { if (b[k] !== undefined) out[k] = b[k]; }); return out;
}
async function findJob(id) {
  if (/^[0-9a-fA-F]{24}$/.test(id)) return Hiring.findById(id);
  return Hiring.findOne({ jobId: id });
}
