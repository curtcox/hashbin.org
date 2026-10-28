/**
 * Credentials for the admin pages: the signed-in admin's own session (ADMIN_USER_ID).
 */
import { getAuthHeaders, initializeAuth } from '/js/auth-loader.js';

export async function adminHeaders() {
  try {
    await initializeAuth();
    return (await getAuthHeaders()) || {};
  } catch {
    return {};
  }
}
