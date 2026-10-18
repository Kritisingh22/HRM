/* ============================================================
   Official payslips — real-backend documents.

   Used by the employee payroll page when the session belongs to
   the real HRM API: the list comes from `GET /api/payroll`
   (scoped to the caller by the backend) and each PDF is generated
   server-side from the stored payroll record. The demo dataset
   keeps its local payslip view.
   ============================================================ */
import { ApiError } from '@/api/mockServer';
import { apiRequest } from '@/api/client';

export interface OfficialPayslip {
  id: string;
  employeeId: string;
  employeeName: string;
  /** payroll period, `YYYY-MM` */
  period: string;
  gross: number;
  /** total of the stored deduction breakdown (PF + TDS + ESI + other) */
  deductions: number;
  net: number;
  /** stored record status: Draft | Approved | Processed | Paid */
  status: string;
  paid: boolean;
  /** ISO date, when the record has one */
  payDate: string | null;
  reference: string | null;
  transactionId: string | null;
}

interface RawPayroll {
  _id: string;
  period?: string;
  gross?: number;
  deductions?: { pf?: number; tds?: number; esi?: number; other?: number } | null;
  net?: number;
  status?: string;
  payDate?: string | null;
  paymentMode?: string | null;
  transactionId?: string | null;
  reference?: string | null;
  employee?: { employeeId?: string; fullName?: string } | null;
}

function sumDeductions(d: RawPayroll['deductions']): number {
  return Number(d?.pf || 0) + Number(d?.tds || 0) + Number(d?.esi || 0) + Number(d?.other || 0);
}

/**
 * The caller's own official payslips, newest first. The backend scopes
 * `GET /api/payroll` by role — employees only ever receive their own
 * rows; the explicit employeeId filter is defence-in-depth.
 */
export async function listMyOfficialPayslips(
  employeeId: string | null | undefined,
): Promise<OfficialPayslip[]> {
  if (!employeeId) return [];
  const res = await apiRequest('/api/payroll');
  const payload = (await res.json()) as { payroll?: RawPayroll[] };
  return (payload.payroll ?? [])
    .filter((row) => row.employee?.employeeId === employeeId)
    .map((row) => ({
      id: String(row._id),
      employeeId: String(row.employee?.employeeId || ''),
      employeeName: row.employee?.fullName || '',
      period: String(row.period || ''),
      gross: Number(row.gross || 0),
      deductions: sumDeductions(row.deductions),
      net: Number(row.net || 0),
      status: String(row.status || 'Draft'),
      paid: String(row.status) === 'Paid',
      payDate: row.payDate ? String(row.payDate) : null,
      reference: row.reference || null,
      transactionId: row.transactionId || null,
    }))
    .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
}

export interface PayslipPdf {
  blob: Blob;
  filename: string;
}

/** Read the server's filename suggestion, if any. */
function filenameFromHeader(header: string | null): string | null {
  if (!header) return null;
  const m = /filename="?([^";]+)"?/i.exec(header);
  return m ? m[1] : null;
}

/** Fetch the server-generated PDF for one payslip (inline disposition). */
export async function fetchPayslipPdf(id: string): Promise<PayslipPdf> {
  const res = await apiRequest(`/api/payroll/${encodeURIComponent(id)}/payslip/pdf`);
  const blob = await res.blob();
  const filename = filenameFromHeader(res.headers.get('Content-Disposition')) ?? `payslip-${id}.pdf`;
  return { blob, filename };
}

/** Human error text for the payslip actions. */
export function payslipErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired — sign in again to open the payslip.';
    if (err.status === 403) return 'You do not have access to this payslip.';
    if (err.status === 404) return 'No official payslip is on file for this record yet.';
    return err.message;
  }
  return 'The payslip could not be prepared — please try again.';
}

/** Trigger a browser download for an object URL (popup-block fallback). */
export function downloadBlobUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
