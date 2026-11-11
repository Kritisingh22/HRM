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

// writes need explicit permissions (HR / Admin / Super Admin via employees:write,
// Manager via employees:update — team scoping is enforced in the controller)
function canWriteOrUpdate(req, res, next) {
  if (hasPermission(req.user.role, 'employees:write') || hasPermission(req.user.role, 'employees:update')) {
    return next();
  }
  return next(ApiError.forbidden('You do not have permission to perform this action.'));
}

router.post('/', canWriteOrUpdate, ctrl.create);
router.put('/:id', canWriteOrUpdate, ctrl.update);
router.delete('/:id', requirePermission('employees:delete'), ctrl.remove);

/* Account credential & status management (HR/Admin/Super Admin company-wide;
   Manager scoped to their team via canAccess in the controller). */
router.post('/:id/reset-password', canWriteOrUpdate, ctrl.resetPassword);
router.post('/:id/invite', canWriteOrUpdate, ctrl.invite);
router.put('/:id/status', canWriteOrUpdate, ctrl.setAccountStatus);

module.exports = router;
