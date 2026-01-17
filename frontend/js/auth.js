/**
 * Authentication Module - Clerk SDK Integration
 * Handles user authentication, session management, and auth state changes
 */

// Clerk instance
let clerkInstance = null;

// Auth state listeners
const authStateListeners = new Set();

/**
 * Initialize Clerk SDK
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export async function initializeClerk() {
  try {
    // Get Clerk publishable key from API config endpoint
    let publishableKey = null;
    try {
      const configResponse = await fetch('/api/config');
      if (configResponse.ok) {
        const config = await configResponse.json();
        publishableKey = config.clerkPublishableKey;
      }
    } catch (configError) {
      console.warn('Failed to fetch config from API:', configError);
    }

    // Fallback to window variable if API fails
    if (!publishableKey) {
      publishableKey = window.CLERK_PUBLISHABLE_KEY;
    }

    if (!publishableKey || publishableKey === 'YOUR_CLERK_PUBLISHABLE_KEY') {
      console.error('Clerk publishable key not configured');
      return false;
    }

    // Load Clerk from CDN with publishable key
    // The clerk.browser.js bundle auto-initializes, so we pass the key via data attribute
    if (!window.Clerk) {
      await loadClerkScript(publishableKey);
    }

    // After loading, window.Clerk is the initialized Clerk instance
    clerkInstance = window.Clerk;

    // Wait for Clerk to be ready
    await clerkInstance.load();

    // Set up auth state listener
    clerkInstance.addListener((session) => {
      notifyAuthStateChange(session);
    });

    console.log('Clerk initialized successfully');
    return true;
  } catch (error) {
    console.error('Clerk initialization failed:', error);
    return false;
  }
}

/**
 * Load Clerk script from CDN
 * @param {string} publishableKey - The Clerk publishable key
 * @returns {Promise<void>}
 */
function loadClerkScript(publishableKey) {
  return new Promise((resolve, reject) => {
    if (window.Clerk) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    // Pass publishable key via data attribute - required for auto-initialization
    script.setAttribute('data-clerk-publishable-key', publishableKey);

    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Clerk script'));

    document.head.appendChild(script);
  });
}

/**
 * Get current authentication state
 * @returns {Promise<Object>} Auth state object
 */
export async function getAuthState() {
  if (!clerkInstance) {
    return { authenticated: false };
  }

  try {
    const session = clerkInstance.session;
    const user = clerkInstance.user;

    if (!session || !user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName || `${user.firstName} ${user.lastName}`,
        email: user.primaryEmailAddress?.emailAddress,
        imageUrl: user.imageUrl,
        // Get primary OAuth provider
        provider: getOAuthProvider(user)
      },
      sessionId: session.id
    };
  } catch (error) {
    console.error('Failed to get auth state:', error);
    return { authenticated: false };
  }
}

/**
 * Get OAuth provider from user external accounts
 * @param {Object} user Clerk user object
 * @returns {string|null} Provider name (google, apple, microsoft, github)
 */
function getOAuthProvider(user) {
  if (!user.externalAccounts || user.externalAccounts.length === 0) {
    return null;
  }

  // Get the primary/most recent external account
  const account = user.externalAccounts[0];
  return account.provider || null;
}

/**
 * Trigger sign-in flow
 * Opens Clerk sign-in modal/redirect
 */
export function signIn() {
  if (!clerkInstance) {
    console.error('Clerk not initialized');
    return;
  }

  try {
    clerkInstance.openSignIn();
  } catch (error) {
    console.error('Sign-in failed:', error);
  }
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function signOut() {
  if (!clerkInstance) {
    console.error('Clerk not initialized');
    return;
  }

  try {
    // Call backend logout endpoint
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getSessionToken()}`
      }
    }).catch(err => {
      console.warn('Backend logout failed, continuing with client logout:', err);
    });

    // Sign out from Clerk
    await clerkInstance.signOut();
    
    // Redirect to home page
    window.location.href = '/';
  } catch (error) {
    console.error('Sign-out failed:', error);
    // Even if sign-out fails, try to clear local state
    window.location.href = '/';
  }
}

/**
 * Get current session token (JWT)
 * @returns {Promise<string|null>} Session token or null if not authenticated
 */
export async function getSessionToken() {
  if (!clerkInstance || !clerkInstance.session) {
    return null;
  }

  try {
    return await clerkInstance.session.getToken();
  } catch (error) {
    console.error('Failed to get session token:', error);
    return null;
  }
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback Function to call when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  authStateListeners.add(callback);
  
  // Return unsubscribe function
  return () => {
    authStateListeners.delete(callback);
  };
}

/**
 * Notify all auth state listeners
 * @param {Object} session Clerk session object
 */
function notifyAuthStateChange(session) {
  authStateListeners.forEach(callback => {
    try {
      callback(session);
    } catch (error) {
      console.error('Auth state listener error:', error);
    }
  });
}

/**
 * Get OAuth provider icon URL
 * @param {string} provider Provider name
 * @returns {string} Provider icon data URI or empty string
 */
export function getProviderIcon(provider) {
  // Return empty string if provider is null, undefined, or not a string
  if (!provider || typeof provider !== 'string') {
    return '';
  }

  const icons = {
    google: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%234285f4%22 d=%22M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z%22/%3E%3Cpath fill=%22%2334a853%22 d=%22M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z%22/%3E%3Cpath fill=%22%23fbbc05%22 d=%22M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z%22/%3E%3Cpath fill=%22%23ea4335%22 d=%22M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z%22/%3E%3C/svg%3E',
    apple: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z%22 fill=%22%23000%22/%3E%3C/svg%3E',
    microsoft: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%23f25022%22 d=%22M1 1h10v10H1z%22/%3E%3Cpath fill=%22%2300a4ef%22 d=%22M13 1h10v10H13z%22/%3E%3Cpath fill=%22%237fba00%22 d=%22M1 13h10v10H1z%22/%3E%3Cpath fill=%22%23ffb900%22 d=%22M13 13h10v10H13z%22/%3E%3C/svg%3E',
    github: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z%22 fill=%22%23181717%22/%3E%3C/svg%3E'
  };

  // Normalize provider name to lowercase for case-insensitive lookup
  const normalizedProvider = provider.toLowerCase();
  return icons[normalizedProvider] || '';
}
