const express = require('express');
const ctrl = require('../controllers/reportController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/summary', requirePermission('reports:read'), ctrl.summary);

module.exports = router;
