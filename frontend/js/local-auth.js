/**
 * Local Authentication Module
 * Simple username-based auth for local development.
 */

const STORAGE_KEY = 'hashbin.localAuthUser';
const authStateListeners = new Set();

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveStoredUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
}

function createAvatarDataUrl(initials) {
  const safeInitials = initials || 'U';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="32" fill="#3b82f6" />
      <text x="32" y="38" text-anchor="middle" font-size="24" fill="#ffffff" font-family="Arial, sans-serif">${safeInitials}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildUserProfile(userId) {
  const displayName = userId;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');

  return {
    id: userId,
    firstName: displayName,
    lastName: '',
    fullName: displayName,
    email: null,
    imageUrl: createAvatarDataUrl(initials),
    provider: 'local'
  };
}

function notifyAuthStateChange() {
  authStateListeners.forEach(callback => {
    try {
      callback(loadStoredUser());
    } catch (error) {
      console.error('Auth state listener error:', error);
    }
  });
}

export async function initializeAuth() {
  return true;
}

export async function getAuthState() {
  const stored = loadStoredUser();
  if (!stored) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    user: buildUserProfile(stored.userId),
    sessionId: null
  };
}

export function signIn() {
  const input = prompt('Enter a username for local mode');
  if (input === null) {
    return;
  }

  const userId = input.trim();
  if (!userId) {
    alert('Username cannot be empty.');
    return;
  }

  if (userId.length > 256) {
    alert('Username must be 256 characters or less.');
    return;
  }

  saveStoredUser({ userId });
  notifyAuthStateChange();
}

export async function signOut() {
  clearStoredUser();
  notifyAuthStateChange();
  window.location.href = '/';
}

export async function getSessionToken() {
  const stored = loadStoredUser();
  return stored ? stored.userId : null;
}

export async function getAuthHeaders() {
  const stored = loadStoredUser();
  if (!stored) {
    return null;
  }

  return {
    Authorization: `LocalDev ${stored.userId}`
  };
}

export function onAuthStateChange(callback) {
  authStateListeners.add(callback);
  return () => {
    authStateListeners.delete(callback);
  };
}

export function getProviderIcon() {
  return '';
}
