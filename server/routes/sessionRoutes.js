const express = require('express');
const ctrl = require('../controllers/sessionController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.get('/me', ctrl.me);
router.patch('/me/location', ctrl.updateMyLocation);
router.get('/', ctrl.list); // HR/Manager/Admin — scoped inside the controller

module.exports = router;
