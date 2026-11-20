/* ============================================================
   Designation API service — real HRM backend endpoints.
   Used only when the session is issued by the HRM API
   (`isApiSession()` === true). Demo sessions keep using the
   local reducer and never touch these functions.
   ============================================================ */
import { apiGet, apiSend, type ApiError } from './services/http';

export interface DesignationRow {
  _id: string;
  id?: string;
  name: string;
  title?: string;
  description?: string;
  departmentId: string;
  level?: string;
  isActive: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListDesignationsResponse {
  count: number;
  designations: DesignationRow[];
}

export interface ListByDepartmentResponse {
  count: number;
  department: { _id: string; name: string; isActive: boolean };
  designations: DesignationRow[];
}

export interface DesignationPayload {
  name: string;
  departmentId: string;
  description?: string;
  level?: string;
  isActive?: boolean;
  order?: number;
}

/** GET /api/designations — all designations (optionally ?departmentId=). */
export async function listDesignations(params?: {
  departmentId?: string;
}): Promise<ListDesignationsResponse> {
  const qs = params?.departmentId ? `?departmentId=${encodeURIComponent(params.departmentId)}` : '';
  return apiGet<ListDesignationsResponse>(`/api/designations${qs}`);
}

/** GET /api/designations/active — active designations only. */
export async function listActiveDesignations(params?: {
  departmentId?: string;
}): Promise<ListDesignationsResponse> {
  const qs = params?.departmentId ? `?departmentId=${encodeURIComponent(params.departmentId)}` : '';
  return apiGet<ListDesignationsResponse>(`/api/designations/active${qs}`);
}

/** GET /api/designations/department/:departmentId — designations for a department. */
export async function listDesignationsByDepartment(
  departmentId: string,
): Promise<ListByDepartmentResponse> {
  return apiGet<ListByDepartmentResponse>(
    `/api/designations/department/${encodeURIComponent(departmentId)}`,
  );
}

/** POST /api/designations — create a designation. */
export async function createDesignation(
  body: DesignationPayload,
): Promise<{ designation: DesignationRow }> {
  return apiSend('POST', '/api/designations', body);
}

/** PATCH /api/designations/:id — update a designation. */
export async function updateDesignation(
  id: string,
  body: Partial<DesignationPayload>,
): Promise<{ designation: DesignationRow }> {
  return apiSend('PATCH', `/api/designations/${encodeURIComponent(id)}`, body);
}

/** PATCH /api/designations/:id/status — activate or deactivate. */
export async function setDesignationStatus(
  id: string,
  isActive: boolean,
): Promise<{ designation: DesignationRow }> {
  return apiSend('PATCH', `/api/designations/${encodeURIComponent(id)}/status`, {
    isActive,
  });
}

/** DELETE /api/designations/:id — soft-delete (blocked when employees reference it). */
export async function deleteDesignation(id: string): Promise<{ ok: boolean; message: string }> {
  return apiSend('DELETE', `/api/designations/${encodeURIComponent(id)}`);
}
