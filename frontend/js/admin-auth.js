/**
 * Credentials for the admin pages: the signed-in admin's own session (ADMIN_USER_ID),
 * or, while it is still accepted, the legacy admin token typed into the page.
 */
import { getAuthHeaders, initializeAuth } from '/js/auth-loader.js';

export async function adminHeaders(token = null) {
  if (token) return { 'X-Admin-Token': token };
  try {
    await initializeAuth();
    return (await getAuthHeaders()) || {};
  } catch {
    return {};
  }
}
