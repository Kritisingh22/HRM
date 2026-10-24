/**
 * Employee ID Generator
 * 
 * Format: CY<YYMM><INITIALS><SERIAL>
 * Example: CY0125JS201
 * - CY: Company prefix
 * - YYMM: Joining year/month (e.g., 0125 = January 2025)
 * - INITIALS: First letter of first name + first letter of last name
 * - SERIAL: Department-specific 3-digit serial number
 * 
 * Department serial ranges:
 * - Engineering: 100-199
 * - HR: 200-299
 * - Other category 1: 300-399 (configurable)
 * - Other category 2: 400-499 (configurable)
 */

const Counter = require('../models/Counter');

const DEPARTMENT_SERIAL_MAP = {
  'Engineering': { start: 100, end: 199 },
  'Human Resources': { start: 200, end: 299 },
  'HR': { start: 200, end: 299 },
  'Project Management': { start: 300, end: 399 },
  'Project': { start: 300, end: 399 },
};

const DEFAULT_SERIAL_RANGE = { start: 100, end: 999 };

/**
 * Extract initials from full name
 * Takes first letter of first name and first letter of last name
 * @param {string} fullName 
 * @returns {string} Two uppercase initials
 */
function getInitials(fullName) {
  if (!fullName) return 'XX';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase().padEnd(2, 'X');
  }
  const first = parts[0].charAt(0).toUpperCase();
  const last = parts[parts.length - 1].charAt(0).toUpperCase();
  return first + last;
}

/**
 * Get the serial range for a department
 * @param {string} department 
 * @returns {{start: number, end: number}}
 */
function getSerialRange(department) {
  return DEPARTMENT_SERIAL_MAP[department] || DEFAULT_SERIAL_RANGE;
}

/**
 * Generate the date prefix from joining date
 * Format: YYMM (e.g., 0125 for January 2025)
 * @param {Date|string} joiningDate 
 * @returns {string} YYMM format
 */
function getDatePrefix(joiningDate) {
  const date = new Date(joiningDate);
  const year = date.getFullYear().toString().slice(-2).padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return year + month;
}

/**
 * Generate the next serial number for a department
 * Uses atomic counter increment
 * @param {string} department 
 * @returns {Promise<number>}
 */
async function getNextSerial(department) {
  const range = getSerialRange(department);
  const counterKey = `employee:${department}:${range.start}`;
  
  const counter = await Counter.findByIdAndUpdate(
    counterKey,
    { $inc: { seq: 1 } },
    { 
      new: true, 
      upsert: true,
      setDefaultsOnInsert: true 
    }
  );
  
  let serial = counter.seq;
  
  // If we've exceeded the range, wrap around to the start
  if (serial > range.end) {
    serial = range.start;
    await Counter.findByIdAndUpdate(counterKey, { seq: serial });
  }
  
  return serial;
}

/**
 * Generate a complete employee ID
 * @param {Object} params
 * @param {string} params.fullName - Employee's full name
 * @param {Date|string} params.joiningDate - Joining date
 * @param {string} params.department - Department name
 * @returns {Promise<string>} Generated employee ID
 */
async function generateEmployeeId({ fullName, joiningDate, department }) {
  const initials = getInitials(fullName);
  const datePrefix = getDatePrefix(joiningDate);
  const serial = await getNextSerial(department);
  const serialStr = serial.toString().padStart(3, '0');
  
  return `CY${datePrefix}${initials}${serialStr}`;
}

/**
 * Check if an employee ID already exists
 * @param {string} employeeId 
 * @returns {Promise<boolean>}
 */
async function employeeIdExists(employeeId) {
  const Employee = require('../models/Employee');
  const existing = await Employee.findOne({ employeeId });
  return !!existing;
}

/**
 * Generate a unique employee ID with collision handling
 * @param {Object} params 
 * @param {number} maxRetries 
 * @returns {Promise<string>}
 */
async function generateUniqueEmployeeId(params, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const id = await generateEmployeeId(params);
    const exists = await employeeIdExists(id);
    if (!exists) return id;
    // If collision, the counter should have advanced, so next iteration will get new serial
  }
  throw new Error('Unable to generate unique employee ID after maximum retries');
}

module.exports = {
  generateEmployeeId,
  generateUniqueEmployeeId,
  getInitials,
  getDatePrefix,
  getSerialRange,
  getNextSerial,
  employeeIdExists,
  DEPARTMENT_SERIAL_MAP,
  DEFAULT_SERIAL_RANGE,
};