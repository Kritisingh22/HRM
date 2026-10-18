/* ============================================================
   Formatting helpers — money, names, status pills, ids
   ============================================================ */

/** `145000` → `₹1,45,000` (Indian grouping) */
export function money(n: number | null | undefined): string {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

/** Large sums as lakh / crore, the way HR reports them: `4260000` → `₹42.6L` */
export function moneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
}

export function initials(name: string | null | undefined): string {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const AVATAR_COLORS = [
  'var(--teal)',
  'var(--violet)',
  'var(--blue)',
  'var(--orange)',
  'var(--amber)',
  'var(--green)',
] as const;

/** Stable avatar colour per record so a person keeps the same colour everywhere. */
export function avatarColor(seed: string): string {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Status → pill class, mirroring the pill vocabulary of the design system. */
const STATUS_CLASS: Record<string, string> = {
  // green — healthy / done
  Active: 'st-approved',
  Completed: 'st-approved',
  Approved: 'st-approved',
  Accepted: 'st-approved',
  Selected: 'st-approved',
  Hired: 'st-approved',
  Achieved: 'st-approved',
  Paid: 'st-approved',
  Processed: 'st-approved',
  Resolved: 'st-approved',
  Outstanding: 'st-approved',
  Excellent: 'st-approved',
  Verified: 'st-approved',
  Signed: 'st-approved',
  Published: 'st-approved',
  Open: 'st-approved',
  // amber — in flight / needs attention
  Pending: 'st-pending',
  Draft: 'st-pending',
  Scheduled: 'st-pending',
  Sent: 'st-pending',
  'In Progress': 'st-pending',
  Screening: 'st-pending',
  Shortlisted: 'st-pending',
  Probation: 'st-pending',
  'On Hold': 'st-pending',
  Calculated: 'st-pending',
  'Partially Achieved': 'st-pending',
  'Notice Period': 'st-pending',
  Planning: 'st-pending',
  Review: 'st-pending',
  'Pending Feedback': 'st-pending',
  Good: 'st-pending',
  Notice: 'st-pending',
  // red — blocked / negative
  Rejected: 'st-rejected',
  Terminated: 'st-rejected',
  Missed: 'st-rejected',
  Overdue: 'st-rejected',
  Unsatisfactory: 'st-rejected',
  Blocked: 'st-rejected',
  Withdrawn: 'st-rejected',
  Expired: 'st-rejected',
  // blue — informational
  Interview: 'st-info',
  'Technical Round': 'st-info',
  'HR Round': 'st-info',
  'Offer Sent': 'st-info',
  'On Leave': 'st-info',
  'Offer Accepted': 'st-info',
  // muted
  Cancelled: 'st-cancelled',
  Closed: 'st-cancelled',
  'Not Started': 'st-muted',
  'To Do': 'st-muted',
  Applied: 'st-muted',
  Resigned: 'st-muted',
  Retired: 'st-muted',
  // orange — needs a nudge
  'Needs Improvement': 'st-orange',
  Suspended: 'st-orange',
  'Clearance Pending': 'st-orange',
  'Resignation Submitted': 'st-orange',
  'Final Settlement': 'st-orange',
  'Offer Declined': 'st-rejected',
};

export function statusClass(status?: string | null): string {
  if (!status) return 'st-muted';
  return STATUS_CLASS[status] || 'st-muted';
}

/** Priority → pill class so priority chips share the status language. */
export function priorityClass(priority: string): string {
  switch (priority) {
    case 'Critical':
    case 'High':
      return 'st-rejected';
    case 'Medium':
      return 'st-pending';
    default:
      return 'st-muted';
  }
}

/** A leaving note: `2 Sep 2026 · HR · 2 h ago` */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Percentage, guarding against divide-by-zero. */
export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n || 0)));
}

/** Mint the next id in a `PREFIX-1234` sequence and bump the counter. */
export function nextSeq(prefix: string, seq: number, width = 3): { id: string; seq: number } {
  const n = seq + 1;
  return { id: `${prefix}-${String(n).padStart(width, '0')}`, seq: n };
}

/** `CY0525RS109`-style roster id — initials of the name + a sequence. */
export function buildRosterId(name: string, seq: number): string {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0] || '')[0] || 'X') + ((parts[1] || '')[0] || 'X');
  const d = new Date();
  const yy = pad2(d.getFullYear() % 100);
  const mm = pad2(d.getMonth() + 1);
  return `CY${mm}${yy}${ini.toUpperCase()}${String(100 + seq)}`;
}

function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}
