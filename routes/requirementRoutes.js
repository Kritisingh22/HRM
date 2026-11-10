const express = require('express');
const ctrl = require('../controllers/requirementController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);                                    // scoped: own / all
router.get('/:id', ctrl.getOne);                               // object-level access
router.post('/', requirePermission('requirements:write'), ctrl.create);  // Manager creates
router.put('/:id', ctrl.update);                               // Manager/HR update
router.post('/:id/create-job', requirePermission('hiring:write'), ctrl.createJob); // HR creates job
router.delete('/:id', requirePermission('requirements:delete'), ctrl.remove);

module.exports = router;