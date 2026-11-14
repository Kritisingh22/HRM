/* ============================================================
   Notice Service — publish with fan-out to notifications.

   • Publishing a notice creates one notification per recipient
     based on audience (all / department / role / specific users).
   • Supports start and expiry dates.
   • Notifications are created in the same operation as the notice.
   ============================================================ */

const Notice = require('../models/Notice');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { createBulkNotifications } = require('./notificationService');
const { logAudit } = require('../utils/audit');

/**
 * Resolve the list of target users for a notice based on audience.
 * @param {Object} notice - the Notice document
 * @returns {Promise<User[]>}
 */
async function resolveNoticeAudience(notice) {
  const { audience, audienceDepartments, audienceRoles, audienceUserIds } = notice;

  let query = {};

  if (audience === 'all') {
    query = { status: 'active' };
  } else if (audience === 'department' && audienceDepartments && audienceDepartments.length) {
    const employees = await Employee.find({ department: { $in: audienceDepartments } }).select('user');
    query = { _id: { $in: employees.map((e) => e.user).filter(Boolean) }, status: 'active' };
  } else if (audience === 'role' && audienceRoles && audienceRoles.length) {
    query = { role: { $in: audienceRoles }, status: 'active' };
  } else if (audience === 'specific' && audienceUserIds && audienceUserIds.length) {
    query = { _id: { $in: audienceUserIds }, status: 'active' };
  } else {
    /* Default: all active users. */
    query = { status: 'active' };
  }

  return User.find(query).select('_id fullName email role');
}

/**
 * Publish a notice and fan out notifications to all recipients.
 * @param {Object} noticeData - { title, body, audience, audienceDepartments?, audienceRoles?, audienceUserIds?, startDate?, expiryDate?, pinned? }
 * @param {Object} actor - Express req.user (author)
 * @param {Object} req - Express request
 * @returns {Promise<{notice, notificationCount: number}>}
 */
async function publishNotice(noticeData, actor, req) {
  const notice = await Notice.create({
    ...noticeData,
    author: actor._id,
    publishedAt: noticeData.startDate || new Date(),
    status: noticeData.status || 'Published',
  });

  const recipients = await resolveNoticeAudience(notice);

  const notifs = recipients.map((user) => ({
    user: user._id,
    type: 'notice.published',
    title: notice.title,
    message: notice.body,
    relatedEntity: { type: 'Notice', id: notice._id },
    channels: { inApp: true, email: false },
    priority: notice.pinned ? 'High' : 'Normal',
    metadata: { noticeId: notice._id, audience: notice.audience },
  }));

  let notificationCount = 0;
  if (notifs.length) {
    const created = await createBulkNotifications(notifs);
    notificationCount = created.length;
  }

  logAudit(req, {
    action: 'notice.publish',
    targetType: 'Notice',
    targetId: notice._id,
    description: `Published notice "${notice.title}" to ${recipients.length} recipient(s). ${notificationCount} notifications created.`,
  });

  return { notice, notificationCount };
}

module.exports = { publishNotice, resolveNoticeAudience };
