const express = require('express');
const ctrl = require('../controllers/offboardingController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);                                      // own, or all for HR/Admin
router.post('/', requirePermission('offboarding:write'), ctrl.initiate);
router.put('/:id', requirePermission('offboarding:write'), ctrl.update);
module.exports = router;
