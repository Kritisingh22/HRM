const express = require('express');
const ctrl = require('../controllers/transferController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);                                    // scoped
router.get('/:id', ctrl.getOne);                               // object-level access
router.post('/', requirePermission('transfers:write'), ctrl.create);  // HR creates
router.put('/:id', requirePermission('transfers:approve'), ctrl.update); // HR approves/implements
router.delete('/:id', requirePermission('transfers:delete'), ctrl.remove);

module.exports = router;