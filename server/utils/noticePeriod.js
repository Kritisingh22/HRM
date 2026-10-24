/* ============================================================
   Notice Period Calculation — backend version (Node/JS).
   Mirrors client/src/lib/noticePeriod.ts — keep logic identical.
   ============================================================ */

/** Notice period options. */
const NOTICE_PERIOD_OPTIONS = ['Immediate', '30 days', '60 days', '90 days'];

/** Holiday entry (date + name). */
class HolidayEntry {
  constructor(date, name) {
    this.date = date; // YYYY-MM-DD
    this.name = name;
  }
}

/** Default configuration — uses calendar days, resignation date is day 0. */
const DEFAULT_CONFIG = {
  holidays: [],
  resignationDateIsDayOne: false,
};

/** Parse notice period string to number of working days. */
function parseNoticePeriod(option) {
  switch (option) {
    case 'Immediate':
      return 0;
    case '30 days':
      return 30;
    case '60 days':
      return 60;
    case '90 days':
      return 90;
    default:
      return 30; // default fallback
  }
}

/** Check if a date is a weekend. */
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/** Check if a date is a holiday. */
function isHoliday(date, holidays) {
  const iso = date.toISOString().slice(0, 10);
  return holidays.some((h) => h.date === iso);
}

/** Add working days to a date, skipping weekends and holidays. */
function addWorkingDays(startDate, workingDays, config = DEFAULT_CONFIG) {
  if (workingDays <= 0) return startDate;

  const start = new Date(startDate + 'T00:00:00');
  let current = new Date(start);
  let daysAdded = 0;

  // If resignation date counts as day 1, we start counting from the resignation date
  // Otherwise, we start from the NEXT day
  if (!config.resignationDateIsDayOne) {
    current.setDate(current.getDate() + 1);
  }

  while (daysAdded < workingDays) {
    // Skip weekends and holidays
    if (!isWeekend(current) && !isHoliday(current, config.holidays)) {
      daysAdded++;
      if (daysAdded >= workingDays) break;
    }
    current.setDate(current.getDate() + 1);
  }

  // Format as YYYY-MM-DD
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const day = String(current.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calculate last working day from resignation date and notice period. */
function calculateLastWorkingDay(resignationDate, noticePeriod, config = DEFAULT_CONFIG) {
  const workingDays = parseNoticePeriod(noticePeriod);
  if (workingDays === 0) return resignationDate; // Immediate
  return addWorkingDays(resignationDate, workingDays, config);
}

/** Validate that last working day is consistent with resignation date and notice period. */
function validateLastWorkingDay(resignationDate, noticePeriod, providedLastWorkingDay, config = DEFAULT_CONFIG) {
  const expected = calculateLastWorkingDay(resignationDate, noticePeriod, config);
  if (providedLastWorkingDay === expected) {
    return { valid: true, expected };
  }
  return {
    valid: false,
    expected,
    message: `Last working day should be ${expected} based on resignation date ${resignationDate} and notice period "${noticePeriod}".`,
  };
}

/** Get all supported notice period options for UI dropdowns. */
function getNoticePeriodOptions() {
  return [...NOTICE_PERIOD_OPTIONS];
}

module.exports = {
  parseNoticePeriod,
  addWorkingDays,
  calculateLastWorkingDay,
  validateLastWorkingDay,
  getNoticePeriodOptions,
  DEFAULT_CONFIG,
  NOTICE_PERIOD_OPTIONS,
};