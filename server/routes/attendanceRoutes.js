const express = require('express');
const ctrl = require('../controllers/attendanceController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);                                       // scoped
router.post('/', requirePermission('attendance:write'), ctrl.upsert);
router.put('/:id', requirePermission('attendance:write'), ctrl.update);

module.exports = router;
