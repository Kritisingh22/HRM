/* ============================================================
   Auth API service
   ============================================================ */
import { apiSend } from './services/http';

/** Change the logged-in user's password (verifies current password). */
export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; message: string }> {
  return apiSend('POST', '/api/auth/change-password', params);
}
