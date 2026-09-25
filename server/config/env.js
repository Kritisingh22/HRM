/* Central configuration, loaded from environment variables (.env). */
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const cfg = {
  NODE_ENV,
  isProd: NODE_ENV === 'production',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cyethack_hr',

  JWT_SECRET: process.env.JWT_SECRET || 'dev-access-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5000',
  COOKIE_NAME: 'cyethack_refresh',

  // One-time setup token for POST /api/auth/bootstrap-admin. Bootstrap requires
  // BOTH an empty user store AND this exact token. Empty (unset) = bootstrap
  // disabled entirely. Never expose this to the frontend; keep it in .env only.
  SETUP_TOKEN: process.env.SETUP_TOKEN || '',

  MAX_FAILED_LOGINS: parseInt(process.env.MAX_FAILED_LOGINS || '5', 10),
  ACCOUNT_LOCK_MINUTES: parseInt(process.env.ACCOUNT_LOCK_MINUTES || '15', 10),
<<<<<<< HEAD
  BCRYPT_ROUNDS: 12
=======
  BCRYPT_ROUNDS: 12,

  // Email configuration (optional - if not set, email notifications are disabled)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'HRM Portal <noreply@cyethack.com>',

  // Daily Report reminder configuration
  DAILY_REPORT_DEADLINE_HOUR: parseInt(process.env.DAILY_REPORT_DEADLINE_HOUR || '17', 10), // 5 PM default
  DAILY_REPORT_DEADLINE_MINUTE: parseInt(process.env.DAILY_REPORT_DEADLINE_MINUTE || '0', 10),
  DAILY_REPORT_REMINDER_FREQUENCY_HOURS: parseInt(process.env.DAILY_REPORT_REMINDER_FREQUENCY_HOURS || '24', 10), // 24 hours = no duplicate within same day
  DAILY_REPORT_ESCALATE_TO_MANAGER: process.env.DAILY_REPORT_ESCALATE_TO_MANAGER !== 'false', // true by default
  DAILY_REPORT_ESCALATE_TO_HR: process.env.DAILY_REPORT_ESCALATE_TO_HR === 'true', // false by default
>>>>>>> 0f31467 (intial Update HRM 1.1)
};

// Refuse to start in production with default secrets.
if (cfg.isProd && (cfg.JWT_SECRET.includes('change-me') || cfg.JWT_REFRESH_SECRET.includes('change-me'))) {
  // eslint-disable-next-line no-console
  console.error('FATAL: set real JWT_SECRET and JWT_REFRESH_SECRET in .env before running in production.');
  process.exit(1);
}

// Refuse to start in production with an UNSAFE bootstrap setup token. An empty
// SETUP_TOKEN is allowed — it disables bootstrap entirely, which is the safe
// steady state once the first admin exists. But if a token IS set it must be
// strong and must not be the shipped placeholder, so a guessable value can never
// reach production. (In development/test this check is skipped.)
if (cfg.isProd && cfg.SETUP_TOKEN) {
  const unsafe = cfg.SETUP_TOKEN.includes('change-this') ||
                 cfg.SETUP_TOKEN.includes('change-me') ||
                 cfg.SETUP_TOKEN.length < 16;
  if (unsafe) {
    // eslint-disable-next-line no-console
    console.error('FATAL: SETUP_TOKEN is set but is the placeholder or too short (need a random secret of at least 16 characters). Set a strong SETUP_TOKEN, or leave it blank to disable bootstrap.');
    process.exit(1);
  }
}

module.exports = cfg;
