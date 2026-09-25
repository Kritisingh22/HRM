const express = require('express');
const ctrl = require('../controllers/projectController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);                                      // projects you manage / are a member of
router.get('/:id', ctrl.getOne);                                 // object-level access
router.post('/', requirePermission('projects:write'), ctrl.create);
router.put('/:id', requirePermission('projects:write'), ctrl.update);
module.exports = router;
