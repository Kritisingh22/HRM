const express = require('express');
const ctrl = require('../controllers/orgChartController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// Authentication is required for the org chart; the controller then scopes the
// returned tree by the authenticated role (HR/Admin/Super → company; Manager →
// own team; Employee → own reporting line). Scoping is enforced server-side.
router.use(authenticate);
router.get('/', ctrl.tree);
module.exports = router;
