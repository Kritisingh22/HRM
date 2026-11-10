const express = require('express');
const ctrl = require('../controllers/noticeController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);                                      // audience-scoped
router.post('/', requirePermission('notices:write'), ctrl.create);
router.put('/:id', requirePermission('notices:write'), ctrl.update);
router.delete('/:id', requirePermission('notices:delete'), ctrl.remove);
module.exports = router;
