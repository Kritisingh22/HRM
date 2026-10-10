const express = require('express');
const ctrl = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.summary);
module.exports = router;
