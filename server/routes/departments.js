const express = require('express');
const ctrl = require('../controllers/departmentController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/active', ctrl.listActive);
router.post('/', requirePermission('employees:write'), ctrl.create);
router.put('/:id', requirePermission('employees:write'), ctrl.update);
router.patch('/:id/status', requirePermission('employees:write'), ctrl.setStatus);
router.patch('/:id', requirePermission('employees:write'), ctrl.update);
router.delete('/:id', requirePermission('employees:delete'), ctrl.remove);

module.exports = router;
