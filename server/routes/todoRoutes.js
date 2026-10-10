const express = require('express');
const ctrl = require('../controllers/todoController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);        // own tasks only
router.post('/', ctrl.create);     // owner = the caller
router.put('/:id', ctrl.update);   // owner only
router.delete('/:id', ctrl.remove);// owner only
module.exports = router;
