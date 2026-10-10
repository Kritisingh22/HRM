const express = require('express');
const ctrl = require('../controllers/payslipRequestController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

// Employee: own requests
router.get('/my', ctrl.myRequests);

// List (scoped by role)
router.get('/', ctrl.list);

// Get one (object-level authorization)
router.get('/:id', ctrl.getOne);

// Employee creates own request
router.post('/', requirePermission('payslipRequests:create_own'), ctrl.create);

// Review/update (HR/Manager/Admin)
router.put('/:id', requirePermission('payslipRequests:review'), ctrl.update);

module.exports = router;