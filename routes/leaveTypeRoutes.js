const express = require('express');
const ctrl = require('../controllers/leaveTypeController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/seed', requirePermission('leaveTypes:write'), ctrl.seedDefaults);
router.get('/:id', ctrl.getOne);
router.post('/', requirePermission('leaveTypes:write'), ctrl.create);
router.put('/:id', requirePermission('leaveTypes:write'), ctrl.update);
router.delete('/:id', requirePermission('leaveTypes:delete'), ctrl.delete);

module.exports = router;