const express = require('express');
const ctrl = require('../controllers/workCalendarPolicyController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/current', ctrl.getCurrentForDate);
router.get('/', ctrl.list);
router.get('/active', ctrl.getActive);
router.get('/:id', ctrl.getOne);
router.post('/', requirePermission('calendar:write'), ctrl.create);
router.put('/:id', requirePermission('calendar:write'), ctrl.update);
router.delete('/:id', requirePermission('calendar:write'), ctrl.delete);

module.exports = router;