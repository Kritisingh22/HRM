/* ============================================================
   Notification Service — shared helper for creating notifications.

   All business-change notifications MUST go through this service so
   they are never missed or duplicated. When called inside a
   mongoose session/transaction, notifications are written within
   the same transaction so they commit or roll back together.

   Rules:
   • One notification per user per related entity per event type
     (deduplicated by checking for an existing unread notification
     with the same relatedEntity + type within 24 hours).
   • Never throws — failures are logged and swallowed so the
     primary business operation is never blocked by a notification
     problem.
   • Never returns password hashes, token hashes, or secrets.
   ============================================================ */

const Notification = require('../models/Notification');
const User = require('../models/User');

/* Deduplication window: don't create a duplicate unread notification
   for the same user + entity + type within this many hours. */
const DEDUP_WINDOW_HOURS = 24;

/**
 * Create one notification for one user.
 * @param {Object} data
 * @param {mongoose.Types.ObjectId} data.user - target user _id
 * @param {string} data.type - notification type string
 * @param {string} data.title
 * @param {string} data.message
 * @param {Object} [data.relatedEntity] - { type: 'TeamTask', id: ObjectId }
 * @param {Object} [data.channels] - { inApp: Boolean, email: Boolean }
 * @param {string} [data.priority] - 'Low'|'Normal'|'High'|'Urgent'
 * @param {Object} [data.metadata] - extra key/value data
 * @param {Object} [data.session] - optional mongoose session for transactions
 * @returns {Promise<import('mongoose').Document|null>} the created doc or null if deduped
 */
async function createNotification(data) {
  const {
    user, type, title, message, relatedEntity, channels,
    priority = 'Normal', metadata, session,
  } = data || {};

  if (!user || !type || !title || !message) {
    console.error('[notificationService] createNotification: missing required fields');
    return null;
  }

  try {
    /* Deduplication: skip if an unread notification for the same user,
       entity, and type already exists within the dedup window. */
    if (relatedEntity && relatedEntity.type && relatedEntity.id) {
      const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
      const existing = await Notification.findOne({
        user,
        type,
        read: false,
        'relatedEntity.type': relatedEntity.type,
        'relatedEntity.id': relatedEntity.id,
        createdAt: { $gte: since },
      }).session(session ? session : null);
      if (existing) return null;
    }

    const notification = await Notification.create([{
      user,
      type,
      title,
      message,
      relatedEntity: relatedEntity || undefined,
      channels: channels || { inApp: true, email: false },
      priority,
      metadata: metadata || undefined,
    }], { session: session || null });

    return notification[0] || null;
  } catch (err) {
    console.error('[notificationService] createNotification failed:', err.message);
    return null;
  }
}

/**
 * Create notifications for many users in one batch (insertMany).
 * Used for notice fan-out, offboarding completion broadcasts, etc.
 * @param {Array<Object>} notifications - array of notification data (without session)
 * @param {Object} [data.session] - optional mongoose session
 * @returns {Promise<Array>} created docs (may be empty)
 */
async function createBulkNotifications(notifications, session) {
  if (!Array.isArray(notifications) || notifications.length === 0) return [];

  /* Validate each entry has required fields. */
  const valid = notifications.filter((n) =>
    n.user && n.type && n.title && n.message
  );

  if (valid.length === 0) return [];

  try {
    return await Notification.insertMany(valid, { session: session || null, ordered: false });
  } catch (err) {
    console.error('[notificationService] createBulkNotifications failed:', err.message);
    return [];
  }
}

/**
 * Get unread notification count for a user.
 */
async function getUnreadCount(userId) {
  try {
    return await Notification.countDocuments({ user: userId, read: false });
  } catch (err) {
    console.error('[notificationService] getUnreadCount failed:', err.message);
    return 0;
  }
}

module.exports = { createNotification, createBulkNotifications, getUnreadCount };
