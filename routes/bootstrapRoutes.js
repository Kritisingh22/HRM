const express = require('express');
const ctrl = require('../controllers/bootstrapController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.summary);

module.exports = router;
