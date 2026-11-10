const express = require('express');
const ctrl = require('../controllers/employeeController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { hasPermission } = require('../utils/permissions');
const ApiError = require('../utils/ApiError');

const router = express.Router();
router.use(authenticate); // every employee route requires a valid session

// self-service: the signed-in user edits their OWN limited profile fields
// (phone/location/address/emergency). No HR permission required; the record is
// resolved from the token, so it can only ever touch the caller's own record.
// Registered BEFORE '/:id' so it is matched as a distinct path.
router.put('/me/profile', ctrl.updateOwnProfile);

// reads are row-level scoped inside the controller (own / team / all)
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);

// writes need explicit permissions (HR / Admin / Super Admin)
// Manager can update team members via employees:update (checked in controller for team scope)
function canWriteOrUpdate(req, res, next) {
  if (hasPermission(req.user.role, 'employees:write') || hasPermission(req.user.role, 'employees:update')) {
    return next();
  }
  return next(ApiError.forbidden('You do not have permission to perform this action.'));
}

router.post('/', requirePermission('employees:write'), ctrl.create);
router.put('/:id', canWriteOrUpdate, ctrl.update);
router.delete('/:id', requirePermission('employees:delete'), ctrl.remove);

module.exports = router;
