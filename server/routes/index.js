/* Mounts every API router under /api. */
const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/employees', require('./employeeRoutes'));
router.use('/leaves', require('./leaveRoutes'));
router.use('/attendance', require('./attendanceRoutes'));
router.use('/payroll', require('./payrollRoutes'));
router.use('/hiring', require('./hiringRoutes'));
router.use('/performance', require('./performanceRoutes'));
router.use('/projects', require('./projectRoutes'));
router.use('/documents', require('./documentRoutes'));
router.use('/notices', require('./noticeRoutes'));
router.use('/helpdesk', require('./helpdeskRoutes'));
router.use('/offboarding', require('./offboardingRoutes'));
router.use('/org-chart', require('./orgChartRoutes'));
router.use('/reports', require('./reportRoutes'));
router.use('/analytics', require('./analyticsRoutes'));
router.use('/audit', require('./auditRoutes'));
<<<<<<< HEAD
=======
router.use('/daily-reports', require('./dailyReportRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/permissions', require('./permissionRoutes'));
router.use('/requirements', require('./requirementRoutes'));
router.use('/transfers', require('./transferRoutes'));
>>>>>>> 0f31467 (intial Update HRM 1.1)

module.exports = router;
