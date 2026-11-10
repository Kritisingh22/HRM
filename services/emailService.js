/* Email service — sends emails using Nodemailer.
 * Configuration is read from environment variables (config/env.js).
 * If SMTP is not configured, emails are silently skipped (logged only). */
const nodemailer = require('nodemailer');
const cfg = require('../config/env');

let transporter = null;

function getTransporter() {
  if (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE, // true for 465, false for 587/2525
      auth: {
        user: cfg.SMTP_USER,
        pass: cfg.SMTP_PASS,
      },
      // Allow self-signed certs in development
      tls: cfg.isProd ? undefined : { rejectUnauthorized: false },
    });
  }
  return transporter;
}

/**
 * Send an email.
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - HTML body
 * @returns {Promise<Object>} Nodemailer send info or { skipped: true }
 */
async function sendEmail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx) {
    console.log('[Email] SMTP not configured; skipping email to', Array.isArray(to) ? to.join(', ') : to);
    console.log('[Email] Subject:', subject);
    return { skipped: true, messageId: 'smtp-not-configured' };
  }

  const recipients = Array.isArray(to) ? to.join(', ') : to;
  try {
    const info = await tx.sendMail({
      from: cfg.EMAIL_FROM,
      to: recipients,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });
    console.log('[Email] Sent to', recipients, '| MessageID:', info.messageId);
    return info;
  } catch (err) {
    console.error('[Email] Failed to send to', recipients, ':', err.message);
    throw err;
  }
}

/**
 * Send a daily report reminder email.
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.toName - Recipient name
 * @param {string} params.date - Report date (YYYY-MM-DD)
 * @param {string} [params.role] - User role for context
 * @param {boolean} [params.isEscalation] - Whether this is an escalation to manager/HR
 * @param {string} [params.employeeName] - Name of employee (for escalation)
 */
async function sendDailyReportReminder({ toEmail, toName, date, role = 'Employee', isEscalation = false, employeeName }) {
  const dateStr = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const deadlineStr = `${cfg.DAILY_REPORT_DEADLINE_HOUR.toString().padStart(2, '0')}:${cfg.DAILY_REPORT_DEADLINE_MINUTE.toString().padStart(2, '0')}`;

  let subject, text, html;

  if (isEscalation) {
    subject = `⚠ Daily Report Missing — ${employeeName} (${dateStr})`;
    text = `Dear ${toName},\n\nThis is an escalation reminder. The daily report for ${employeeName} for ${dateStr} has not been submitted by the deadline (${deadlineStr}).\n\nPlease follow up with the employee to ensure submission.\n\n---\nCYETHACK HRM Portal`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">⚠ Daily Report Missing — Escalation</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${toName}</strong>,</p>
          <p>This is an <strong>escalation reminder</strong>. The daily report for <strong>${employeeName}</strong> for <strong>${dateStr}</strong> has not been submitted by the deadline (<strong>${deadlineStr}</strong>).</p>
          <p>Please follow up with the employee to ensure submission.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">CYETHACK HRM Portal</p>
        </div>
      </div>
    `;
  } else {
    subject = `📋 Daily Report Reminder — ${dateStr}`;
    text = `Dear ${toName},\n\nThis is a reminder that your daily task report for ${dateStr} has not been submitted. The submission deadline is ${deadlineStr}.\n\nPlease submit your report as soon as possible via the HRM Portal.\n\n---\nCYETHACK HRM Portal`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #509888; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">📋 Daily Report Reminder</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Dear <strong>${toName}</strong>,</p>
          <p>This is a reminder that your daily task report for <strong>${dateStr}</strong> has not been submitted.</p>
          <p>The submission deadline is <strong>${deadlineStr}</strong>.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${cfg.FRONTEND_URL}/employee/daily-reports" style="background: #509888; color: #06231c; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Submit Report Now</a>
          </p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">CYETHACK HRM Portal</p>
        </div>
      </div>
    `;
  }

  return sendEmail({ to: toEmail, subject, text, html });
}

/**
 * Send a daily report submission confirmation email.
 */
async function sendDailyReportSubmitted({ toEmail, toName, date }) {
  const dateStr = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const subject = `✅ Daily Report Submitted — ${dateStr}`;
  const text = `Dear ${toName},\n\nYour daily report for ${dateStr} has been successfully submitted.\n\n---\nCYETHACK HRM Portal`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #22c55e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">✅ Daily Report Submitted</h2>
      </div>
      <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Dear <strong>${toName}</strong>,</p>
        <p>Your daily report for <strong>${dateStr}</strong> has been successfully submitted.</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px;">CYETHACK HRM Portal</p>
      </div>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
}

/**
 * Send a daily report reviewed notification.
 */
async function sendDailyReportReviewed({ toEmail, toName, date, reviewerName, reviewNote }) {
  const dateStr = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const subject = `📝 Daily Report Reviewed — ${dateStr}`;
  const text = `Dear ${toName},\n\nYour daily report for ${dateStr} has been reviewed by ${reviewerName}.\n${reviewNote ? `Review note: ${reviewNote}` : ''}\n\n---\nCYETHACK HRM Portal`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">📝 Daily Report Reviewed</h2>
      </div>
      <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Dear <strong>${toName}</strong>,</p>
        <p>Your daily report for <strong>${dateStr}</strong> has been reviewed by <strong>${reviewerName}</strong>.</p>
        ${reviewNote ? `<p><strong>Review note:</strong> ${reviewNote}</p>` : ''}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px;">CYETHACK HRM Portal</p>
      </div>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
}

module.exports = { sendEmail, sendDailyReportReminder, sendDailyReportSubmitted, sendDailyReportReviewed };