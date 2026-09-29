const express = require('express');
const ctrl = require('../controllers/accessRequestController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.post('/', ctrl.create);
router.get('/', ctrl.list);
router.put('/:id', ctrl.decide);
router.put('/:id/revoke', ctrl.revoke);

module.exports = router;
