const express = require('express');
const ctrl = require('../controllers/analyticsController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/overview', requirePermission('analytics:read'), ctrl.overview);
module.exports = router;
