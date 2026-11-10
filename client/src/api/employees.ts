/* ============================================================
   Employee API service
   ============================================================ */
import { apiSend, apiErrorMessage, type ApiError } from './services/http';

export interface CreateEmployeeParams {
  fullName: string;
  email: string;
  phone?: string;
  gender?: string;
  department: string;
  designation: string;
  departmentId?: string;
  designationId?: string;
  manager?: string;
  location?: string;
  employmentType?: string;
  joiningDate: string;
  status?: string;
  salary?: number;
  grade?: string;
}

export interface EmployeeResponse {
  employee: {
    employeeId: string;
    fullName: string;
    email: string;
    department: string;
    designation: string;
    // ... other fields
  };
}

/**
 * Create a new employee via the API
 * The backend will auto-generate the employeeId
 */
export async function createEmployee(params: CreateEmployeeParams): Promise<EmployeeResponse> {
  return apiSend('POST', '/api/employees', params);
}

/**
 * Update an employee
 */
export async function updateEmployee(employeeId: string, params: Partial<CreateEmployeeParams>): Promise<EmployeeResponse> {
  return apiSend('PUT', `/api/employees/${encodeURIComponent(employeeId)}`, params);
}

/**
 * Get an employee by ID
 */
export async function getEmployee(employeeId: string) {
  return apiSend('GET', `/api/employees/${encodeURIComponent(employeeId)}`);
}