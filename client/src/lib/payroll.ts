/* ============================================================
   Payroll maths — the portal stores monthly in-hand only.

   Monthly salary is split by the company standard:
     Basic 50% · HRA 20% · Conveyance ₹1,600 · Special = remainder
   Professional tax is a flat ₹200 for everyone.
   ============================================================ */
import type { Employee, PayrollRow } from '@/types';
import { MONTHS_LONG, todayISO, toISO } from '@/lib/date';

export const PROFESSIONAL_TAX = 200;
export const CONVEYANCE = 1600;

export interface SalaryBreakdown {
  basic: number;
  hra: number;
  conv: number;
  special: number;
  gross: number;
}

export function salaryBreakdown(salary: number): SalaryBreakdown {
  const basic = Math.round(salary * 0.5);
  const hra = Math.round(salary * 0.2);
  const special = Math.max(0, salary - basic - hra - CONVEYANCE);
  return { basic, hra, conv: CONVEYANCE, special, gross: salary };
}

export function buildPayrollRow(employee: Employee, opts?: { bonus?: number; otherDed?: number }): PayrollRow {
  const parts = salaryBreakdown(employee.salary);
  const bonus = opts?.bonus ?? 0;
  const otherDed = opts?.otherDed ?? 0;
  const gross = parts.gross + bonus;
  const ded = PROFESSIONAL_TAX + otherDed;
  return {
    empId: employee.id,
    basic: parts.basic,
    hra: parts.hra,
    conv: parts.conv,
    special: parts.special,
    bonus,
    gross,
    pt: PROFESSIONAL_TAX,
    otherDed,
    ded,
    net: gross - ded,
    payStatus: 'Pending',
  };
}

/** `2026-10` → `October 2026` */
export function periodLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7);
}

export function shiftPeriod(key: string, months: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Pay date: the last day of the payroll period. */
export function periodPayDate(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return toISO(new Date(y, m, 0));
}

export function periodFromDate(iso: string): string {
  return iso.slice(0, 7);
}

/** Is `iso` within the given `YYYY-MM` period? */
export function inPeriod(iso: string | undefined | null, key: string): boolean {
  return !!iso && iso.slice(0, 7) === key;
}

/** The last `n` payroll periods, newest first, starting at the current month. */
export function recentPeriods(n: number): string[] {
  const out: string[] = [];
  let cursor = currentPeriod();
  for (let i = 0; i < n; i++) {
    out.push(cursor);
    cursor = shiftPeriod(cursor, -1);
  }
  return out;
}
