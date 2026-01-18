/**
 * Auth Gate
 * Protects pages that require authentication
 * Redirects unauthenticated users to the landing page
 */

import { getAuthState, initializeAuth } from './auth-loader.js';
import { redirectWithReturn, getReturnUrl } from './utils.js';

/**
 * Check if user is authenticated and redirect if not
 * @param {Object} options Configuration options
 * @returns {Promise<boolean>} True if authenticated, false otherwise
 */
export async function requireAuth(options = {}) {
  const {
    redirectTo = '/',
    showLoading = true
  } = options;

  // Show loading state
  if (showLoading) {
    showAuthGateLoading();
  }

  // Initialize auth module (Clerk or local)
  await initializeAuth();

  // Check auth state
  const authState = await getAuthState();

  if (!authState.authenticated) {
    // Not authenticated, redirect to landing page
    redirectWithReturn(redirectTo);
    return false;
  }

  // Authenticated, hide loading and show content
  if (showLoading) {
    hideAuthGateLoading();
  }

  return true;
}

/**
 * Show auth gate loading screen
 */
function showAuthGateLoading() {
  // Create loading overlay
  const overlay = document.createElement('div');
  overlay.id = 'auth-gate-loading';
  overlay.className = 'auth-gate-loading';
  overlay.innerHTML = `
    <div class="spinner"></div>
    <p>Checking authentication...</p>
  `;
  
  document.body.appendChild(overlay);
}

/**
 * Hide auth gate loading screen
 */
function hideAuthGateLoading() {
  const overlay = document.getElementById('auth-gate-loading');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Show session expired message
 * @param {string} message Custom message
 */
export function showSessionExpired(message = 'Your session has expired. Please sign in again.') {
  const main = document.querySelector('main');
  if (main) {
    main.innerHTML = `
      <div class="session-expired">
        <h2>Session Expired</h2>
        <p>${message}</p>
        <a href="/" class="btn btn-primary">Sign In</a>
      </div>
    `;
  }
}

/**
 * Handle return URL after authentication
 * If there's a return URL in the query params, redirect to it
 */
export function handleReturnUrl() {
  const returnUrl = getReturnUrl();
  if (returnUrl) {
    window.location.href = returnUrl;
  }
}
