/* Re-export the email service under the name controllers import.
 * Kept as a thin shim so callers using require('../services/email') keep working. */
'use strict';

module.exports = require('./emailService');