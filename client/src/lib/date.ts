/* ============================================================
   Date helpers — all dates are ISO `YYYY-MM-DD` strings, which
   compare lexicographically and avoid timezone surprises.
   ============================================================ */

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const pad = (n: number): string => (n < 10 ? '0' : '') + n;

/** Date → `YYYY-MM-DD` using local time. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` → local Date at midnight. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

export function isWeekendISO(iso: string): boolean {
  return isWeekend(parseISO(iso));
}

/** `2026-09-02` → `2 Sep 2026` */
export function niceDate(iso?: string | null): string {
  if (!iso) return '—';
  const parts = String(iso).split('-');
  if (parts.length < 3) return String(iso);
  return `${Number(parts[2])} ${MONTHS[Number(parts[1]) - 1]} ${parts[0]}`;
}

/** `2026-09-02` → `2 Sep` — used in dense lists and dashboard tables. */
export function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  const parts = String(iso).split('-');
  if (parts.length < 3) return String(iso);
  return `${Number(parts[2])} ${MONTHS[Number(parts[1]) - 1]}`;
}

/** `2 Sep` or `2 Sep – 4 Sep` depending on whether it is a range. */
export function dateRange(from?: string | null, to?: string | null): string {
  if (!from) return '—';
  if (!to || to === from) return shortDate(from);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth ? `${Number(from.slice(8))}–${shortDate(to)}` : `${shortDate(from)} – ${shortDate(to)}`;
}

/** `Wednesday, 2 Sep 2026` */
export function longDate(iso: string): string {
  const d = parseISO(iso);
  return `${DAYS_LONG[d.getDay()]}, ${niceDate(iso)}`;
}

export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTHS_LONG[monthIndex]} ${year}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Monday-first offset used by the leave calendar grid. */
export function mondayOffset(year: number, monthIndex: number): number {
  return (new Date(year, monthIndex, 1).getDay() + 6) % 7;
}

/** The last `n` working days ending today (or the last weekday). */
export function lastWorkingDays(n: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < n) {
    if (!isWeekend(d)) out.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/** Months back from now, oldest first — used by the analytics window. */
export function lastMonths(n: number): Array<{ y: number; m: number; key: string; label: string }> {
  const out: Array<{ y: number; m: number; key: string; label: string }> = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      y: t.getFullYear(),
      m: t.getMonth(),
      key: `${t.getFullYear()}-${pad(t.getMonth() + 1)}`,
      label: MONTHS[t.getMonth()],
    });
  }
  return out;
}

export function endOfMonth(y: number, m: number): Date {
  return new Date(y, m + 1, 0);
}

export function sameMonth(iso: string | undefined | null, key: string): boolean {
  return !!iso && String(iso).slice(0, 7) === key;
}

/** Whole years between a joining date and now, one decimal. */
export function yearsSince(iso: string): number {
  const diff = Date.now() - parseISO(iso).getTime();
  return Math.round((diff / (365.25 * 864e5)) * 10) / 10;
}

/** Deterministic pseudo-random in [0,1) from a string seed. */
export function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Small deterministic PRNG so demo series look identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genSeries(n: number, min: number, max: number, seed: number): number[] {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => Math.round(min + r() * (max - min)));
}

/** Add days to an ISO date and get an ISO date back. */
export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Monday-first ISO date of the week containing `iso` (the calendar's week view). */
export function weekStartISO(iso: string): string {
  const d = parseISO(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export function nowTime(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** Current clock in the register's display format, e.g. `09:05 AM`. */
export function clockNow(): string {
  return nowTime().toUpperCase();
}

/** A server timestamp (epoch ms) → `09:15 AM`. */
export function timeFromMs(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).toUpperCase();
}

/** A server timestamp (epoch ms) → `2 Sep 2026`. */
export function dateFromMs(ms: number): string {
  return niceDate(toISO(new Date(ms)));
}

/** Elapsed milliseconds → `09h 05m` (minute precision, never negative). */
export function durationFromMs(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return `${pad(Math.floor(mins / 60))}h ${pad(mins % 60)}m`;
}

/** ISO date-time → `16 Oct 2026 · 06:20 PM` on the local clock. */
export function stampText(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).toUpperCase();
  return `${niceDate(toISO(d))} · ${time}`;
}

/** Current month as `YYYY-MM`. */
export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

/** Anything the backend might send → `2 Sep 2026`, tolerating full timestamps. */
export function normalizeDate(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : toISO(d);
}
