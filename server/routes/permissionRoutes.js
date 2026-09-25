const express = require('express');
const ctrl = require('../controllers/permissionController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

// Current user's permissions
router.get('/me', ctrl.getMyPermissions);

// Module/action reference
router.get('/modules', ctrl.getModulesAndActions);

// User permission management (requires users:manage or permissions:manage)
router.get('/user/:userId', requirePermission('users:manage'), ctrl.getUserPermissions);
router.put('/user/:userId', requirePermission('users:manage'), ctrl.updateUserPermissions);
router.post('/user/:userId/add', requirePermission('users:manage'), ctrl.addUserPermissions);
router.post('/user/:userId/remove', requirePermission('users:manage'), ctrl.removeUserPermissions);

module.exports = router;