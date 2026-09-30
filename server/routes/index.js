/* Mounts every API router under /api. */
const express = require('express');
const { mongoose } = require('../config/database');
const router = express.Router();

// Unauthenticated liveness/readiness probe for the host platform (Render) and
// for humans. Reports whether the API process is up AND whether the MongoDB
// connection is live, so "API running but DB down" is distinguishable from
// "all good". It deliberately exposes only a state WORD — never the host,
// database name, URI, or any credential.
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/health', (req, res) => {
  const database = DB_STATES[mongoose.connection.readyState] || 'unknown';
  const ready = database === 'connected';
  res.status(ready ? 200 : 503).json({
    status: 'ok', // the API process itself is up and serving
    database, // 'connected' | 'disconnected' | 'connecting' | 'disconnecting'
    time: new Date().toISOString(),
  });
});

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
router.use('/daily-reports', require('./dailyReportRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/permissions', require('./permissionRoutes'));
router.use('/requirements', require('./requirementRoutes'));
router.use('/transfers', require('./transferRoutes'));
router.use('/sessions', require('./sessionRoutes'));
router.use('/access-requests', require('./accessRequestRoutes'));

module.exports = router;
