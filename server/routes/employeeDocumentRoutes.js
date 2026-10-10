const express = require('express');
const ctrl = require('../controllers/employeeDocumentController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const multer = require('multer');

const router = express.Router();
router.use(authenticate);

const upload = multer({ 
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', upload.single('file'), ctrl.upload);
router.get('/:id/download', ctrl.download);
router.get('/:id/url', ctrl.getSignedUrl);
router.put('/:id', ctrl.update);
router.post('/:id/verify', ctrl.verify);
router.delete('/:id', ctrl.delete);
router.get('/:id/url', ctrl.getSignedUrl);

module.exports = router;