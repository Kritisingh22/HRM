const express = require('express');
const ctrl = require('../controllers/departmentController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', requirePermission('employees:write'), ctrl.create);
router.patch('/:id', requirePermission('employees:write'), ctrl.update);
router.delete('/:id', requirePermission('employees:delete'), ctrl.remove);

module.exports = router;
