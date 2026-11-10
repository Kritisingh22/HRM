const express = require('express');
const ctrl = require('../controllers/dailyReportController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/missing', ctrl.missing);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/mark-overdue', requirePermission('dailyReports:write'), ctrl.markOverdue);
router.post('/send-reminders', requirePermission('dailyReports:write'), ctrl.sendReminders);

module.exports = router;