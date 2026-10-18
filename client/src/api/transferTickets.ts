/* ============================================================
   Transfer Ticket API service — Manager-initiated employee transfer requests
   with multi-step approval workflow.
   ============================================================ */
import {
  apiGet,
  apiSend,
  apiErrorMessage,
  ApiError,
} from '@/api/services/http';
import type {
  TransferTicket,
  DiscoverableEmployee,
  TransferTarget,
} from '@/types';

export { ApiError, apiErrorMessage };

const BASE = '/api/transfer-tickets';

export interface TransferTicketListResponse {
  count: number;
  transferTickets: TransferTicket[];
}

export interface TransferTicketResponse {
  transferTicket: TransferTicket;
}

export interface DiscoverableEmployeesResponse {
  count: number;
  employees: DiscoverableEmployee[];
}

export interface AvailableTargetsResponse {
  managers: TransferTarget[];
  hrs: TransferTarget[];
}

export interface HistoryResponse {
  history: TransferTicket['history'];
}

export interface CreateTransferTicketInput {
  employeeId: string;
  targetManagerId: string;
  targetHrId: string;
  reason: string;
  businessJustification?: string;
  requestedEffectiveDate: string;
  supportingDocument?: string;
}

export interface ApproveInput {
  reason?: string;
}

export interface RejectInput {
  reason: string;
}

export interface CancelInput {
  reason?: string;
}

/** List transfer tickets (scoped by role) */
export async function listTransferTickets(params?: {
  status?: string;
}): Promise<TransferTicketListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiGet<TransferTicketListResponse>(`${BASE}${qs}`);
}

/** Get a single transfer ticket by ID */
export async function getTransferTicket(id: string): Promise<TransferTicketResponse> {
  return apiGet<TransferTicketResponse>(`${BASE}/${encodeURIComponent(id)}`);
}

/** Get transfer ticket history */
export async function getTransferTicketHistory(id: string): Promise<HistoryResponse> {
  return apiGet<HistoryResponse>(`${BASE}/${encodeURIComponent(id)}/history`);
}

/** Create a new transfer ticket */
export async function createTransferTicket(
  input: CreateTransferTicketInput
): Promise<TransferTicketResponse> {
  return apiSend<TransferTicketResponse>('POST', BASE, input);
}

/** Approve the current step of a transfer ticket */
export async function approveTransferTicket(
  id: string,
  input: ApproveInput = {}
): Promise<TransferTicketResponse> {
  return apiSend<TransferTicketResponse>('POST', `${BASE}/${encodeURIComponent(id)}/approve`, input);
}

/** Reject the current step of a transfer ticket */
export async function rejectTransferTicket(
  id: string,
  input: RejectInput
): Promise<TransferTicketResponse> {
  return apiSend<TransferTicketResponse>('POST', `${BASE}/${encodeURIComponent(id)}/reject`, input);
}

/** Cancel a transfer ticket */
export async function cancelTransferTicket(
  id: string,
  input: CancelInput = {}
): Promise<TransferTicketResponse> {
  return apiSend<TransferTicketResponse>('POST', `${BASE}/${encodeURIComponent(id)}/cancel`, input);
}

/** Get employees a manager can request transfer for */
export async function getDiscoverableEmployees(): Promise<DiscoverableEmployeesResponse> {
  return apiGet<DiscoverableEmployeesResponse>(`${BASE}/discoverable-employees`);
}

/** Get available target managers and HRs */
export async function getAvailableTargets(): Promise<AvailableTargetsResponse> {
  return apiGet<AvailableTargetsResponse>(`${BASE}/available-targets`);
}