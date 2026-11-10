const express = require('express');
const ctrl = require('../controllers/trainingController');
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

// Trainings
router.get('/trainings', ctrl.listTrainings);
router.get('/trainings/:id', ctrl.getTraining);
router.post('/trainings', requirePermission('trainings:write'), ctrl.createTraining);
router.put('/trainings/:id', requirePermission('trainings:write'), ctrl.updateTraining);
router.delete('/trainings/:id', requirePermission('trainings:delete'), ctrl.deleteTraining);

// Training Assignments
router.get('/assignments', ctrl.listAssignments);
router.get('/assignments/:id', ctrl.getAssignment);
router.post('/assignments', requirePermission('trainingAssignments:write'), ctrl.assignTraining);
router.put('/assignments/:id', requirePermission('trainingAssignments:write'), ctrl.updateAssignmentStatus);
router.post('/assignments/:id/certificate', upload.single('file'), ctrl.uploadCertificate);

module.exports = router;