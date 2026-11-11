/* ============================================================
   Employee API service
   ============================================================ */
import { apiSend, apiGet, apiErrorMessage, type ApiError } from './services/http';

export interface CreateEmployeeParams {
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  personalEmail?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContact?: string;
  department: string;
  departmentId?: string;
  designation: string;
  designationId?: string;
  manager?: string;
  reportingManagerId?: string;
  employmentType?: string;
  workMode?: string;
  workLocation?: string;
  bloodGroup?: string;
  location?: string;
  joiningDate: string;
  salary?: number;
  grade?: string;
  status?: string;
  assignedHrId?: string;
}

/** Returned by POST /api/employees — includes the one-time credentials. */
export interface CreateEmployeeResponse {
  employee: {
    employeeId: string;
    fullName: string;
    email: string;
    department: string;
    designation: string;
    manager?: string;
    employmentType: string;
    joiningDate: string;
    status: string;
    userId: string;
  };
  account: {
    employeeId: string;
    loginUserId: string;
    email: string;
    role: string;
    accountStatus: string;
    mustChangePassword: boolean;
  };
  creator: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  activationToken: string;
  temporaryPassword: string;
  offerLetter?: {
    documentId: string;
    referenceId: string;
    title: string;
    category: string;
    size: number;
    storageProvider: string;
    createdAt: string;
  };
}

/** Result of an admin-initiated password reset (temporary password shown ONCE). */
export interface ResetPasswordResponse {
  ok: boolean;
  employeeId: string;
  loginUserId: string;
  employeeName: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  message: string;
}

/** Result of generating a one-time password-setup invitation. */
export interface InviteResponse {
  ok: boolean;
  employeeId: string;
  loginUserId: string;
  employeeName: string;
  setupToken: string;
  setupTokenExpires: string;
  mustChangePassword: boolean;
  message: string;
}

/** Result of activating/deactivating an account. */
export interface SetAccountStatusResponse {
  ok: boolean;
  employeeId: string;
  loginUserId: string;
  accountStatus: string;
  employeeStatus: string;
  message: string;
}

/** Create a new employee via the API
 * The backend auto-generates the employeeId and provisions a login account.
 * Returns one-time temporary credentials (shown once, never retrievable again).
 */
export async function createEmployee(params: CreateEmployeeParams): Promise<CreateEmployeeResponse> {
  return apiSend('POST', '/api/employees', params);
}

/**
 * Update an employee
 */
export async function updateEmployee(employeeId: string, params: Partial<CreateEmployeeParams>): Promise<CreateEmployeeResponse> {
  return apiSend('PUT', `/api/employees/${encodeURIComponent(employeeId)}`, params);
}

/**
 * Get an employee by ID
 */
export async function getEmployee(employeeId: string) {
  return apiGet(`/api/employees/${encodeURIComponent(employeeId)}`);
}

/**
 * Administrator-initiated password reset.
 * Returns a temporary password shown ONCE (never stored or logged plaintext).
 */
export async function resetEmployeePassword(employeeId: string): Promise<ResetPasswordResponse> {
  return apiSend('POST', `/api/employees/${encodeURIComponent(employeeId)}/reset-password`);
}

/**
 * Generate a one-time password-setup invitation (setup token shown ONCE).
 */
export async function inviteEmployee(employeeId: string): Promise<InviteResponse> {
  return apiSend('POST', `/api/employees/${encodeURIComponent(employeeId)}/invite`);
}

/**
 * Activate or deactivate an employee's login account.
 */
export async function setAccountStatus(employeeId: string, status: 'active' | 'inactive' | 'suspended'): Promise<SetAccountStatusResponse> {
  return apiSend('PUT', `/api/employees/${encodeURIComponent(employeeId)}/status`, { status });
}

/** Activate a new-hire account using the one-time activation token. */
export async function activateAccount(activationToken: string, newPassword: string) {
  return apiSend('POST', '/api/auth/activate-account', { activationToken, newPassword });
}

/** Download an offer letter (or any document) by reference ID. */
export async function downloadOfferLetter(referenceId: string) {
  return apiGet(`/api/documents/reference/${encodeURIComponent(referenceId)}/download`);
}
