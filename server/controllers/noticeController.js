/* Notice Board API. Everyone sees Published notices meant for their audience;
 * HR/Admin see everything (incl. drafts) and are the only ones who write.
 * Publishing fans out one notification per recipient via the notice service. */
const Notice = require('../models/Notice');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { publishNotice } = require('../services/noticeService');

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
  const { notice, notificationCount } = await publishNotice(
    {
      title: req.body.title,
      body: req.body.body,
      audience: req.body.audience || 'all',
      audienceDepartments: req.body.audienceDepartments,
      audienceRoles: req.body.audienceRoles,
      audienceUserIds: req.body.audienceUserIds,
      startDate: req.body.startDate,
      expiryDate: req.body.expiryDate,
      pinned: !!req.body.pinned,
      status: req.body.status || 'Published',
    },
    req.user,
    req
  );
  res.status(201).json({ notice, notificationCount });
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
