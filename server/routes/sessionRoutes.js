const express = require('express');
const ctrl = require('../controllers/sessionController');
const authenticate = require('../middleware/authenticate');
const { sessionLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(authenticate);
router.use(sessionLimiter); // cap session polling to prevent request storms

router.get('/me', ctrl.me);
router.patch('/me/location', ctrl.updateMyLocation);
router.get('/', ctrl.list); // HR/Manager/Admin — scoped inside the controller

module.exports = router;
