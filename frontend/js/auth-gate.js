/**
 * Auth Gate
 * Protects pages that require authentication
 * Redirects unauthenticated users to the landing page
 */

import { getAuthState } from './auth.js';
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

  // Wait a bit for Clerk to initialize
  await waitForClerkInit();

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
 * Wait for Clerk to initialize
 * @param {number} maxWait Maximum wait time in ms
 * @returns {Promise<void>}
 */
async function waitForClerkInit(maxWait = 5000) {
  const startTime = Date.now();
  
  // First, wait for window.Clerk to exist
  while (!window.Clerk && (Date.now() - startTime) < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // If Clerk doesn't exist after waiting, return
  if (!window.Clerk) {
    return;
  }
  
  // Now wait for Clerk to be fully loaded
  // Poll the loaded property instead of relying on Promise.race
  let loadInitiated = false;
  while ((!window.Clerk.loaded) && (Date.now() - startTime) < maxWait) {
    try {
      // Trigger load once if not already loading/loaded
      if (!loadInitiated && window.Clerk.load && typeof window.Clerk.load === 'function') {
        loadInitiated = true;
        // Note: We don't await here because we're polling the loaded property
        window.Clerk.load().catch(err => {
          console.warn('Clerk load error:', err);
        });
      }
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn('Error checking Clerk loaded state:', error);
      break;
    }
  }
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
