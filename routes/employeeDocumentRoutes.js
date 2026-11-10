const express = require('express');
const ctrl = require('../controllers/employeeDocumentController');
const authenticate = require('../middleware/authenticate');
const { employeeDocumentUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', uploadLimiter, employeeDocumentUpload.single('file'), ctrl.upload);
router.get('/:id/download', ctrl.download);
router.get('/:id/url', ctrl.getSignedUrl);
router.put('/:id', ctrl.update);
router.post('/:id/verify', ctrl.verify);
router.delete('/:id', ctrl.delete);

module.exports = router;
