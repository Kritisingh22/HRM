/* ============================================================
   Performance Service — review cycles with finalized immutability.

   • Status flow: Draft → Submitted → Finalized.
   • Finalized reviews are immutable (no field changes).
   • Notify on cycle open (manager), submit (HR), finalize (employee+HR).
   * Role/team scoping enforced in controllers.
   ============================================================ */

const Performance = require('../models/Performance');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { createNotification } = require('./notificationService');
const { logAudit } = require('../utils/audit');

/**
 * Submit a performance review (Draft → Submitted).
 * Only the manager/reviewer can submit.
 * @param {string|ObjectId} performanceId
 * @param {Object} actor
 * @param {Object} req
 * @returns {Promise<Performance>}
 */
async function submitReview(performanceId, actor, req) {
  const review = await Performance.findById(performanceId);
  if (!review) throw new Error('Performance review not found.');
  if (review.status !== 'Draft') throw new Error(`Cannot submit review in status ${review.status}.`);

  review.status = 'Submitted';
  await review.save();

  /* Notify HR. */
  const hrUsers = await User.find({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' });
  for (const hr of hrUsers) {
    await createNotification({
      user: hr._id,
      type: 'performance.submitted',
      title: 'Performance Review Submitted',
      message: `A performance review for cycle ${review.cycle} has been submitted for review.`,
      relatedEntity: { type: 'Performance', id: review._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  logAudit(req, {
    action: 'performance.submit',
    targetType: 'Performance',
    targetId: review._id,
    description: `Submitted performance review for cycle ${review.cycle}.`,
  });

  return review;
}

/**
 * Finalize a performance review (Submitted → Finalized).
 * Finalized reviews are immutable.
 * @param {string|ObjectId} performanceId
 * @param {Object} actor
 * @param {Object} req
 * @returns {Promise<Performance>}
 */
async function finalizeReview(performanceId, actor, req) {
  const review = await Performance.findById(performanceId);
  if (!review) throw new Error('Performance review not found.');
  if (review.status !== 'Submitted') throw new Error(`Cannot finalize review in status ${review.status}.`);

  review.status = 'Finalized';
  await review.save();

  /* Notify the employee. */
  const employee = await Employee.findById(review.employee).select('user fullName employeeId');
  if (employee && employee.user) {
    await createNotification({
      user: employee.user,
      type: 'performance.finalized',
      title: 'Performance Review Finalized',
      message: `Your performance review for cycle ${review.cycle} has been finalized. Rating: ${review.rating || 'N/A'}.`,
      relatedEntity: { type: 'Performance', id: review._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  /* Notify HR. */
  const hrUsers = await User.find({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' });
  for (const hr of hrUsers) {
    await createNotification({
      user: hr._id,
      type: 'performance.finalized',
      title: 'Performance Review Finalized',
      message: `Performance review for cycle ${review.cycle} finalized for employee ${review.employee}.`,
      relatedEntity: { type: 'Performance', id: review._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
    });
  }

  logAudit(req, {
    action: 'performance.finalize',
    targetType: 'Performance',
    targetId: review._id,
    description: `Finalized performance review for cycle ${review.cycle}. Rating: ${review.rating}.`,
  });

  return review;
}

/**
 * Check if a performance review is finalized (immutable).
 * @param {string|ObjectId} performanceId
 * @returns {Promise<boolean>}
 */
async function isFinalized(performanceId) {
  const review = await Performance.findById(performanceId).select('status');
  return review ? review.status === 'Finalized' : false;
}

module.exports = { submitReview, finalizeReview, isFinalized };
