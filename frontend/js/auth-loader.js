/**
 * Auth Module Loader
 * Chooses Clerk or local auth based on /api/config.
 */

let authModulePromise = null;
let config = {};
let initialization;
import { restoreDevice, usingDevice, deviceAuthState, signInDevice as enrollDevice, forgetDevice, deviceHeaders, deviceFetch } from './device-auth.js';

async function loadAuthModule() {
  if (!authModulePromise) {
    authModulePromise = (async () => {
      let authMode = 'clerk';
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          config = await response.json();
          authMode = config.authMode || (config.isLocalMode ? 'local' : 'clerk');
        }
      } catch (error) {
        console.warn('Failed to detect auth mode, defaulting to Clerk.', error);
      }

      if (authMode === 'local') {
        return import('./local-auth.js');
      }

      return import('./auth.js');
    })();
  }

  return authModulePromise;
}

export async function initializeAuth() {
  initialization ||= (async () => {
    const module = await loadAuthModule();
    if (await restoreDevice(config)) return true;
    return module.initializeAuth ? module.initializeAuth() : true;
  })();
  return initialization;
}

export async function getAuthState() {
  await initializeAuth();
  if (usingDevice()) return deviceAuthState();
  const module = await loadAuthModule();
  return module.getAuthState();
}

export async function signIn() {
  if (usingDevice()) {
    await forgetDevice();
    initialization = null;
    await initializeAuth();
  }
  const module = await loadAuthModule();
  return module.signIn();
}

export async function signOut() {
  if (usingDevice()) {
    await forgetDevice();
    window.location.href = '/';
    return;
  }
  const module = await loadAuthModule();
  return module.signOut();
}

export async function getSessionToken() {
  await initializeAuth();
  if (usingDevice()) return null;
  const module = await loadAuthModule();
  return module.getSessionToken();
}

export async function getAuthHeaders(method, url) {
  await initializeAuth();
  if (usingDevice()) return deviceHeaders(method, url);
  const module = await loadAuthModule();
  return module.getAuthHeaders();
}

/** Direct device sign-in, independent of the site's Clerk plan. Call from a click handler. */
export async function signInWithDevice() {
  await loadAuthModule();
  return enrollDevice(config);
}

/** The shared API transport, including proof-bound device requests. */
export async function authFetch(url, options = {}) {
  await initializeAuth();
  if (usingDevice()) return deviceFetch(url, options);
  const headers = new Headers(options.headers);
  const auth = await getAuthHeaders();
  if (!auth) throw new Error('Not authenticated');
  for (const [name, value] of Object.entries(auth)) headers.set(name, value);
  return fetch(url, { ...options, headers });
}

export async function onAuthStateChange(callback) {
  const module = await loadAuthModule();
  return module.onAuthStateChange(callback);
}

export async function getProviderIcon(provider) {
  const module = await loadAuthModule();
  return module.getProviderIcon(provider);
}
