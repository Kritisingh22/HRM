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

/** Returned by POST /api/employees — includes the one-time activation token. */
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
    email: string;
    role: string;
    accountStatus: string;
    mustChangePassword: boolean;
  };
  activationToken: string;
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

/**
 * Create a new employee via the API
 * The backend auto-generates the employeeId and provisions a login account.
 * Returns a one-time activation token (deliver to the employee out-of-band).
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

/** Activate a new-hire account using the one-time activation token. */
export async function activateAccount(activationToken: string, newPassword: string) {
  return apiSend('POST', '/api/auth/activate-account', { activationToken, newPassword });
}

/** Download an offer letter (or any document) by reference ID. */
export async function downloadOfferLetter(referenceId: string) {
  return apiGet(`/api/documents/reference/${encodeURIComponent(referenceId)}/download`);
}