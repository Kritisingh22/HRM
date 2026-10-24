/* ============================================================
   Notice Period Calculation — shared utility for frontend/preview
   and backend validation. Keep logic identical in both places.
   ============================================================ */

/** Notice period options. */
export type NoticePeriodOption = 'Immediate' | '30 days' | '60 days' | '90 days';

/** Holiday entry (date + name). */
export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  name: string;
}

/** Configuration for notice period calculation. */
export interface NoticePeriodConfig {
  /** Holiday list to exclude from working day count. */
  holidays: HolidayEntry[];
  /** Count resignation date as day 1 (true) or day 0 (false). */
  resignationDateIsDayOne: boolean;
}

/** Default configuration — uses calendar days, resignation date is day 0. */
export const DEFAULT_NOTICE_PERIOD_CONFIG: NoticePeriodConfig = {
  holidays: [],
  resignationDateIsDayOne: false,
};

/** Parse notice period string to number of working days. */
export function parseNoticePeriod(option: NoticePeriodOption): number {
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
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/** Check if a date is a holiday. */
function isHoliday(date: Date, holidays: HolidayEntry[]): boolean {
  const iso = date.toISOString().slice(0, 10);
  return holidays.some((h) => h.date === iso);
}

/** Add working days to a date, skipping weekends and holidays. */
export function addWorkingDays(
  startDate: string,
  workingDays: number,
  config: NoticePeriodConfig = DEFAULT_NOTICE_PERIOD_CONFIG
): string {
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
export function calculateLastWorkingDay(
  resignationDate: string,
  noticePeriod: NoticePeriodOption,
  config: NoticePeriodConfig = DEFAULT_NOTICE_PERIOD_CONFIG
): string {
  const workingDays = parseNoticePeriod(noticePeriod);
  if (workingDays === 0) return resignationDate; // Immediate
  return addWorkingDays(resignationDate, workingDays, config);
}

/** Validate that last working day is consistent with resignation date and notice period. */
export function validateLastWorkingDay(
  resignationDate: string,
  noticePeriod: NoticePeriodOption,
  providedLastWorkingDay: string,
  config: NoticePeriodConfig = DEFAULT_NOTICE_PERIOD_CONFIG
): { valid: boolean; expected: string; message?: string } {
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
export function getNoticePeriodOptions(): NoticePeriodOption[] {
  return ['Immediate', '30 days', '60 days', '90 days'];
}