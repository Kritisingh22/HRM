/* ============================================================
   Department API service — real HRM backend endpoints.
   Used only when the session is issued by the HRM API
   (`isApiSession()` === true). Demo sessions keep using the
   local reducer and never touch these functions.
   ============================================================ */
import { apiGet, apiSend, type ApiError } from './services/http';

export interface DepartmentRow {
  _id: string;
  id?: string;
  name: string;
  description?: string;
  code?: string;
  headUserId?: string | null;
  isActive: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListDepartmentsResponse {
  count: number;
  departments: DepartmentRow[];
}

export interface DepartmentPayload {
  name: string;
  description?: string;
  code?: string;
  headUserId?: string | null;
  isActive?: boolean;
  order?: number;
}

/** GET /api/departments — all departments (active and inactive). */
export async function listDepartments(): Promise<ListDepartmentsResponse> {
  return apiGet<ListDepartmentsResponse>('/api/departments');
}

/** GET /api/departments/active — active departments only. */
export async function listActiveDepartments(): Promise<ListDepartmentsResponse> {
  return apiGet<ListDepartmentsResponse>('/api/departments/active');
}

/** POST /api/departments — create a department. */
export async function createDepartment(
  body: DepartmentPayload,
): Promise<{ department: DepartmentRow }> {
  return apiSend('POST', '/api/departments', body);
}

/** PATCH /api/departments/:id — update a department. */
export async function updateDepartment(
  id: string,
  body: Partial<DepartmentPayload>,
): Promise<{ department: DepartmentRow }> {
  return apiSend('PATCH', `/api/departments/${encodeURIComponent(id)}`, body);
}

/** PATCH /api/departments/:id/status — activate or deactivate. */
export async function setDepartmentStatus(
  id: string,
  isActive: boolean,
): Promise<{ department: DepartmentRow }> {
  return apiSend('PATCH', `/api/departments/${encodeURIComponent(id)}/status`, {
    isActive,
  });
}

/** DELETE /api/departments/:id — soft-delete (blocked when employees reference it). */
export async function deleteDepartment(id: string): Promise<{ ok: boolean; message: string }> {
  return apiSend('DELETE', `/api/departments/${encodeURIComponent(id)}`);
}
