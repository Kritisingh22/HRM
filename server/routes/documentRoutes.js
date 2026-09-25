const express = require('express');
const ctrl = require('../controllers/documentController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');

const router = express.Router();
router.use(authenticate);
router.get('/', ctrl.list);                                      // own + shared (scoped)
router.post('/', upload.single('file'), ctrl.upload);            // any user may upload their own (controller scopes)
router.get('/:id/download', ctrl.download);                     // object-level access check
router.delete('/:id', requirePermission('documents:delete'), ctrl.remove);
module.exports = router;
