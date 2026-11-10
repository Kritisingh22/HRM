const express = require('express');
const ctrl = require('../controllers/certificationController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const multer = require('multer');

const router = express.Router();
router.use(authenticate);

const upload = multer({ 
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requirePermission('certifications:write'), ctrl.create);
router.put('/:id', requirePermission('certifications:write'), ctrl.update);
router.delete('/:id', requirePermission('certifications:delete'), ctrl.delete);
router.post('/:id/file', upload.single('file'), ctrl.uploadCertificateFile);
router.get('/:id/download', ctrl.download);

module.exports = router;