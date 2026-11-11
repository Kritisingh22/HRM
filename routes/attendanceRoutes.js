const express = require('express');
const ctrl = require('../controllers/attendanceController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

/* ---- self-service (every authenticated employee, HR, Manager) ---- */
router.get('/', ctrl.list);                                       // scoped list (employee=self, manager=team, HR=assigned, admin=all)
router.get('/me', ctrl.me);                                        // caller's own attendance (+ active session state)
router.post('/check-in', ctrl.checkIn);                            // mandatory check-in with geolocation + geofence
router.post('/heartbeat', ctrl.heartbeat);                         // client heartbeat: active/paused state (server computes totals)
router.post('/pause', ctrl.pause);                                 // explicit pause (blur / idle / tab switch)
router.post('/check-out', ctrl.checkOut);                          // check-out, closes sessions, computes final totals

/* ---- HR/Manager settings ---- */
router.get('/settings', ctrl.getSettings);                         // HR/Manager read geofence + session config
router.post('/settings', requirePermission('attendance:settings'), ctrl.updateSettings); // HR writes

/* ---- weekly summary (existing) ---- */
router.get('/weekly-summary', ctrl.weeklySummary);
router.post('/weekly-summary/run', ctrl.runWeeklySummary);

/* ---- admin upsert / update (existing, scoped) ---- */
router.post('/', requirePermission('attendance:write'), ctrl.upsert);
router.put('/:id', requirePermission('attendance:write'), ctrl.update);

module.exports = router;
