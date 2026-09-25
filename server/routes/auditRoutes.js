const express = require('express');
const ctrl = require('../controllers/auditController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', requirePermission('audit:read'), ctrl.list); // HR / Admin / Super Admin only
module.exports = router;
