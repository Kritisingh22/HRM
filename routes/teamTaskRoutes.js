const express = require('express');
const ctrl = require('../controllers/teamTaskController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('tasks:read'), ctrl.list);
router.get('/calendar', requirePermission('tasks:read'), ctrl.calendar);
router.get('/overdue', requirePermission('tasks:read'), ctrl.getOverdue);
router.get('/upcoming', requirePermission('tasks:read'), ctrl.getUpcoming);
router.post('/', requirePermission('tasks:write'), ctrl.create);
router.get('/:id', requirePermission('tasks:read'), ctrl.getOne);
router.put('/:id', requirePermission('tasks:write'), ctrl.update);
router.put('/:id/status', requirePermission('tasks:write'), ctrl.updateStatus);
router.put('/:id/assign', requirePermission('tasks:write'), ctrl.assign);
router.post('/:id/remind', requirePermission('tasks:write'), ctrl.sendReminder);
router.delete('/:id', requirePermission('tasks:delete'), ctrl.remove);
router.get('/overdue', requirePermission('tasks:read'), ctrl.getOverdue);
router.get('/upcoming', requirePermission('tasks:read'), ctrl.getUpcoming);

module.exports = router;