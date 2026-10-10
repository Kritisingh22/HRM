const express = require('express');
const ctrl = require('../controllers/notificationController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.getUnreadCount);
router.put('/:id/read', ctrl.markAsRead);
router.put('/read-all', ctrl.markAllAsRead);
router.delete('/:id', ctrl.delete);

// Scheduled jobs (protected by internal auth or cron secret)
router.post('/jobs/training-reminders', ctrl.sendTrainingReminders);
router.post('/jobs/leave-balance-reminders', ctrl.sendLeaveBalanceReminders);
router.post('/jobs/payroll-notifications', ctrl.sendPayrollNotifications);

module.exports = router;