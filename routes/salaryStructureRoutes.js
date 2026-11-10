const express = require('express');
const ctrl = require('../controllers/salaryStructureController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requirePermission('salaryStructures:write'), ctrl.create);
router.put('/:id', requirePermission('salaryStructures:write'), ctrl.update);
router.delete('/:id', requirePermission('salaryStructures:write'), ctrl.deactivate);

module.exports = router;