const express = require('express');
const ctrl = require('../controllers/attendanceController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);                                       // scoped
router.get('/me', ctrl.me);                                        // caller's own attendance only
router.get('/weekly-summary', ctrl.weeklySummary);                 // derived weekly summaries, scoped
router.post('/weekly-summary/run', ctrl.runWeeklySummary);         // admin-only, idempotent re-run
router.post('/', requirePermission('attendance:write'), ctrl.upsert);
router.put('/:id', requirePermission('attendance:write'), ctrl.update);

module.exports = router;
