/* ============================================================
   Auth API service
   ============================================================ */
import { apiSend } from './services/http';

/** Change the logged-in user's password (verifies current password). */
export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: boolean; message: string; mustChangePassword?: boolean }> {
  return apiSend('POST', '/api/auth/change-password', params);
}
