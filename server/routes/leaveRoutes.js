const express = require('express');
const ctrl = require('../controllers/leaveController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);                 // scoped: own / team / all
router.get('/calendar', ctrl.calendar);     // calendar view: leaves aggregated by date
router.post('/', ctrl.create);              // employee files for themselves
router.put('/:id', ctrl.update);            // approve/reject/cancel (checked in controller)
router.delete('/:id', requirePermission('leaves:write'), ctrl.remove);

module.exports = router;
