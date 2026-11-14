/* createNotification — create an in-app Notification for ONE specific user.

This is the single place used to notify the actual actor of an administrative
action (e.g. the user who created an employee, or the administrator who reset a
password). It is deliberately NOT a role-based broadcast: the notification is
associated with the exact `userId` passed in, never with every user who shares
that actor's role.

Plaintext passwords and tokens must NEVER be passed in `message` or `metadata`.
*/
const Notification = require('../models/Notification');

async function createNotification({ user, type, title, message, relatedEntity, priority = 'Normal', metadata } = {}) {
  if (!user) throw new Error('createNotification requires a target user id.');
  if (!title || !message) throw new Error('createNotification requires title and message.');

  return Notification.create({
    user,
    type,
    title,
    message,
    relatedEntity: relatedEntity || { type: 'Other', id: null },
    channels: { inApp: true, email: false },
    priority,
    metadata: metadata || {},
  });
}

module.exports = { createNotification };
