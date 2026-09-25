/* Notification API — user-specific notifications (reminders, alerts, etc.).
 *  - Users can only see their own notifications
 *  - Mark as read, list, etc. */
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/* GET /api/notifications
 * Query params: unread (boolean), type, limit, skip */
exports.list = catchAsync(async (req, res) => {
  const { unread, type, limit = 50, skip = 0 } = req.query;

  const filter = { user: req.user._id };
  if (unread === 'true') filter.read = false;
  if (type) filter.type = type;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(parseInt(skip, 10))
    .limit(parseInt(limit, 10));

  const total = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });

  res.json({ count: notifications.length, total, unreadCount, notifications });
});

/* GET /api/notifications/unread-count */
exports.unreadCount = catchAsync(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ unreadCount: count });
});

/* PUT /api/notifications/:id/read — mark as read */
exports.markRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification not found.');
  res.json({ notification });
});

/* PUT /api/notifications/read-all — mark all as read */
exports.markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, read: false },
    { read: true, readAt: new Date() }
  );
  res.json({ ok: true });
});

/* DELETE /api/notifications/:id — delete notification */
exports.remove = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!notification) throw ApiError.notFound('Notification not found.');
  res.json({ ok: true });
});

module.exports = exports;