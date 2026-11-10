const express = require('express');
const ctrl = require('../controllers/hiringController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('hiring:read'), ctrl.list);
router.get('/:id', requirePermission('hiring:read'), ctrl.getOne);
router.post('/', requirePermission('hiring:write'), ctrl.create);
router.put('/:id', requirePermission('hiring:write'), ctrl.update);
router.delete('/:id', requirePermission('hiring:delete'), ctrl.remove);

module.exports = router;
