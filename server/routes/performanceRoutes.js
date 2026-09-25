const express = require('express');
const ctrl = require('../controllers/performanceController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);                                        // own / team / all (scoped)
router.post('/', requirePermission('performance:write'), ctrl.create);
router.put('/:id', requirePermission('performance:write'), ctrl.update);
module.exports = router;
