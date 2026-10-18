const express = require('express');
const ctrl = require('../controllers/transferTicketController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

// Discoverable employees for transfer requests (Manager only)
router.get('/discoverable-employees', ctrl.discoverableEmployees);

// Available target managers and HRs
router.get('/available-targets', ctrl.availableTargets);

// List tickets (scoped by role)
router.get('/', ctrl.list);

// Get single ticket
router.get('/:id', ctrl.getOne);

// Get ticket history
router.get('/:id/history', ctrl.getHistory);

// Create transfer ticket (Manager only)
router.post('/', ctrl.create);

// Approve current step
router.post('/:id/approve', ctrl.approve);

// Reject current step
router.post('/:id/reject', ctrl.reject);

// Cancel ticket
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;