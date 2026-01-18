/**
 * Auth Module Loader
 * Chooses Clerk or local auth based on /api/config.
 */

let authModulePromise = null;

async function loadAuthModule() {
  if (!authModulePromise) {
    authModulePromise = (async () => {
      let authMode = 'clerk';
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
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
  const module = await loadAuthModule();
  return module.initializeAuth ? module.initializeAuth() : true;
}

export async function getAuthState() {
  const module = await loadAuthModule();
  return module.getAuthState();
}

export async function signIn() {
  const module = await loadAuthModule();
  return module.signIn();
}

export async function signOut() {
  const module = await loadAuthModule();
  return module.signOut();
}

export async function getSessionToken() {
  const module = await loadAuthModule();
  return module.getSessionToken();
}

export async function getAuthHeaders() {
  const module = await loadAuthModule();
  return module.getAuthHeaders();
}

export async function onAuthStateChange(callback) {
  const module = await loadAuthModule();
  return module.onAuthStateChange(callback);
}

export async function getProviderIcon(provider) {
  const module = await loadAuthModule();
  return module.getProviderIcon(provider);
}
