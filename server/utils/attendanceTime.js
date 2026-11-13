'use strict';
// Pure timezone formatting helpers for attendance.
// Uses Intl.DateTimeFormat with the company time zone so that timestamps
// are consistent regardless of where the server runs (e.g. Render's UTC).

/** Default company time zone — Asia/Kolkata (UTC+5:30, no DST). */
exports.DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Return a Date representing "now" in the company time zone.
 * The server may run in UTC (Render free tier), so we offset to Kolkata time.
 * @param {Date} [d] — optional date; defaults to now
 * @returns {Date}
 */
function nowInTimezone(d) {
  const date = d || new Date();
  // To simulate Asia/Kolkata (UTC+5:30) without Node tz data dependency:
  return new Date(date.getTime() + OFFSET_MS);
}

/** Offset ms for Asia/Kolkata (UTC+5:30). */
const OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Format a Date as HH:mm in the company time zone.
 * Uses Intl.DateTimeFormat for correct localised formatting.
 * @param {Date} d
 * @param {string} [tz='Asia/Kolkata'] — time zone name for Intl
 * @returns {string} e.g. "09:15"
 */
exports.formatTime = function formatTime(d, tz = exports.DEFAULT_TIMEZONE) {
  const date = nowInTimezone(d);
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
};

/**
 * Format a Date as YYYY-MM-DD in the company time zone.
 * @param {Date} d
 * @param {string} [tz='Asia/Kolkata']
 * @returns {string} e.g. "2026-10-07"
 */
exports.formatDate = function formatDate(d, tz = exports.DEFAULT_TIMEZONE) {
  const date = nowInTimezone(d);
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(date); // => "2026-10-07"
};

/**
 * Parse an HH:mm string into [hours, minutes] in the company time zone.
 * @param {string} str — e.g. "09:15"
 * @returns {{hour: number, minute: number}|null}
 */
exports.parseTime = function parseTime(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour: h, minute: min };
};

/**
 * Convert {hour, minute} to an HH:mm string in the company time zone.
 * @param {{hour: number, minute: number}} parts
 * @returns {string} e.g. "09:15"
 */
exports.timeFromParts = function timeFromParts({ hour, minute }) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};