const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { loginLimiter, bootstrapLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Password is required.')
  ],
  validate,
  ctrl.login
);

router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.post('/change-password', authenticate, ctrl.changePassword);
// Public, but hardened: requires a valid SETUP_TOKEN (constant-time check) AND an
// empty user store, and is rate-limited to blunt token-guessing after a DB reset.
router.post('/bootstrap-admin', bootstrapLimiter, ctrl.bootstrapAdmin);

module.exports = router;
