/* Notice Board API. Everyone sees Published notices meant for their audience;
 * HR/Admin see everything (incl. drafts) and are the only ones who write. */
const Notice = require('../models/Notice');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];

exports.list = catchAsync(async (req, res) => {
  let filter = {};
  if (!SEES_ALL.includes(req.user.role)) {
    const audiences = ['all'];
    if (req.user.role === 'MANAGER') audiences.push('managers');
    filter = { status: 'Published', audience: { $in: audiences } };
  }
  const notices = await Notice.find(filter).populate('author', 'fullName role').sort({ pinned: -1, publishedAt: -1 }).limit(200);
  res.json({ count: notices.length, notices });
});

exports.create = catchAsync(async (req, res) => {
  if (!req.body.title || !req.body.body) throw ApiError.badRequest('title and body are required.');
  const notice = await Notice.create({
    title: req.body.title, body: req.body.body, audience: req.body.audience || 'all',
    pinned: !!req.body.pinned, status: req.body.status || 'Published', author: req.user._id
  });
  res.status(201).json({ notice });
});

exports.update = catchAsync(async (req, res) => {
  const notice = await Notice.findById(req.params.id);
  if (!notice) throw ApiError.notFound('Notice not found.');
  ['title', 'body', 'audience', 'pinned', 'status'].forEach((k) => { if (req.body[k] !== undefined) notice[k] = req.body[k]; });
  await notice.save();
  res.json({ notice });
});

exports.remove = catchAsync(async (req, res) => {
  const notice = await Notice.findByIdAndDelete(req.params.id);
  if (!notice) throw ApiError.notFound('Notice not found.');
  res.json({ ok: true });
});
