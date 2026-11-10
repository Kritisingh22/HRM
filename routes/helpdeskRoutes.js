const express = require('express');
const ctrl = require('../controllers/helpdeskController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);                                      // own tickets, or all for support staff
router.post('/', ctrl.create);                                   // anyone may raise a ticket
router.put('/:id', ctrl.update);                                 // owner comments; support staff manage
module.exports = router;
