const express = require('express');
const ctrl = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', requireRole('HR', 'ADMIN', 'SUPER_ADMIN'), ctrl.list);        // HR + admins can view
router.post('/', requireRole('HR', 'ADMIN', 'SUPER_ADMIN'), ctrl.create);     // provision a user (HR can too; not admin-level — see controller)
router.put('/:id', requireRole('HR', 'ADMIN', 'SUPER_ADMIN'), ctrl.update);
module.exports = router;
