/**
 * Main Application Entry Point
 * Handles page initialization, auth state management, and UI updates
 */

import { 
  initializeClerk, 
  getAuthState, 
  signIn, 
  signOut, 
  onAuthStateChange,
  getProviderIcon
} from './auth.js';

import { 
  authenticatedFetch, 
  formatBalance, 
  showElement, 
  hideElement, 
  setLoading,
  createSpinner,
  showToast,
  handleApiError
} from './utils.js';

// App state
let currentAuthState = null;
let balanceCache = null;

/**
 * Initialize the application
 */
async function init() {
  console.log('Initializing HashBin.org application...');
  
  // Initialize Clerk
  const clerkInitialized = await initializeClerk();
  
  if (!clerkInitialized) {
    showAuthError('Authentication service unavailable');
    return;
  }

  // Set up auth state listener
  onAuthStateChange(handleAuthChange);

  // Update UI with initial auth state
  await updateAuthUI();

  console.log('Application initialized');
}

/**
 * Handle auth state changes
 */
async function handleAuthChange() {
  await updateAuthUI();
}

/**
 * Update authentication UI based on current state
 */
async function updateAuthUI() {
  const authSection = document.getElementById('auth-section');
  if (!authSection) return;

  // Show loading state
  authSection.innerHTML = createAuthLoadingHTML();

  // Get current auth state
  const authState = await getAuthState();
  currentAuthState = authState;

  // Update UI based on auth state
  if (authState.authenticated) {
    authSection.innerHTML = createAuthenticatedHTML(authState.user);
    setupAuthenticatedHandlers();
    // Fetch and display balance
    await updateBalance();
    // Show auth-only nav links
    showAuthOnlyNavigation();
  } else {
    authSection.innerHTML = createUnauthenticatedHTML();
    setupUnauthenticatedHandlers();
    // Hide auth-only nav links
    hideAuthOnlyNavigation();
  }
  
  // Update active page indicator
  updateActiveNavigation();
  
  // Update sidebar active navigation if sidebar exists
  if (document.querySelector('.dashboard-sidebar')) {
    updateSidebarActiveNavigation();
  }
}

/**
 * Create HTML for loading state
 */
function createAuthLoadingHTML() {
  return `
    <div class="auth-loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>
  `;
}

/**
 * Create HTML for unauthenticated state
 */
function createUnauthenticatedHTML() {
  return `
    <button class="btn-sign-in" id="sign-in-btn">Sign In</button>
  `;
}

/**
 * Create HTML for authenticated state
 */
function createAuthenticatedHTML(user) {
  const providerIcon = getProviderIcon(user.provider);
  // Only render provider icon if we have a non-empty src
  const providerIconHTML = providerIcon
    ? `<img class="provider-icon" src="${providerIcon}" alt="${user.provider || ''}" title="Signed in with ${user.provider}">` 
    : '';

  return `
    <div class="user-info">
      <img class="avatar" src="${user.imageUrl}" alt="${user.fullName}">
      <span class="user-name">${user.fullName}</span>
      ${providerIconHTML}
    </div>
    <div class="balance" id="balance-display">
      <span class="balance-loading">Loading balance...</span>
    </div>
    <button class="btn-sign-out" id="sign-out-btn">Sign Out</button>
  `;
}

/**
 * Set up event handlers for unauthenticated state
 */
function setupUnauthenticatedHandlers() {
  const signInBtn = document.getElementById('sign-in-btn');
  if (signInBtn) {
    signInBtn.addEventListener('click', handleSignIn);
  }
}

/**
 * Set up event handlers for authenticated state
 */
function setupAuthenticatedHandlers() {
  const signOutBtn = document.getElementById('sign-out-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', handleSignOut);
  }
}

/**
 * Handle sign in button click
 */
function handleSignIn() {
  signIn();
}

/**
 * Handle sign out button click
 */
async function handleSignOut() {
  if (confirm('Are you sure you want to sign out?')) {
    await signOut();
  }
}

/**
 * Fetch and display user balance
 */
async function updateBalance() {
  const balanceDisplay = document.getElementById('balance-display');
  if (!balanceDisplay) return;

  try {
    // Show loading state
    balanceDisplay.innerHTML = '<span class="balance-loading">Loading...</span>';

    // Fetch balance from API
    const response = await authenticatedFetch('/api/balance');
    await handleApiError(response);
    
    const data = await response.json();
    balanceCache = data;

    // Display balance
    const balanceCents = data.balance_cents;
    const balanceFormatted = formatBalance(balanceCents);
    
    if (balanceCents === 0) {
      balanceDisplay.innerHTML = `
        <span class="balance-amount zero">${balanceFormatted}</span>
        <a href="/deposit.html" class="deposit-link">Add funds</a>
      `;
    } else {
      balanceDisplay.innerHTML = `
        <span class="balance-amount">${balanceFormatted}</span>
      `;
    }
  } catch (error) {
    console.error('Failed to fetch balance:', error);
    balanceDisplay.innerHTML = `
      <span class="balance-error" onclick="window.app.updateBalance()">
        Unable to load balance. Click to retry.
      </span>
    `;
  }
}

/**
 * Show authentication error
 */
function showAuthError(message) {
  const authSection = document.getElementById('auth-section');
  if (authSection) {
    authSection.innerHTML = `
      <div class="auth-error">${message}</div>
    `;
  }
}

/**
 * Get current authentication state
 * @returns {Object|null} Current auth state or null
 */
export function getCurrentAuthState() {
  return currentAuthState;
}

/**
 * Get cached balance
 * @returns {Object|null} Cached balance data or null
 */
export function getCachedBalance() {
  return balanceCache;
}

/**
 * Show navigation items that require authentication
 */
function showAuthOnlyNavigation() {
  const authOnlyLinks = document.querySelectorAll('.nav-header nav a.auth-only');
  authOnlyLinks.forEach(link => {
    link.style.display = '';
  });
}

/**
 * Hide navigation items that require authentication
 */
function hideAuthOnlyNavigation() {
  const authOnlyLinks = document.querySelectorAll('.nav-header nav a.auth-only');
  authOnlyLinks.forEach(link => {
    link.style.display = 'none';
  });
}

/**
 * Update active navigation indicator based on current page
 */
function updateActiveNavigation() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-header nav a');
  
  // Remove existing active states
  navLinks.forEach(link => {
    link.classList.remove('nav-active');
  });
  
  // Determine which nav item should be active
  let activeLink = null;
  
  // Dashboard pages (including sub-pages)
  if (currentPath === '/dashboard.html' || 
      currentPath === '/api-keys.html' || 
      currentPath === '/api-keys-create.html' || 
      currentPath === '/api-keys-detail.html' ||
      currentPath === '/deposit.html' ||
      currentPath.startsWith('/dashboard/')) {
    activeLink = document.querySelector('.nav-header nav a[href="/dashboard.html"]');
  }
  // Upload page
  else if (currentPath === '/upload.html') {
    activeLink = document.querySelector('.nav-header nav a[href="/upload.html"]');
  }
  // Retrieve and Info pages
  else if (currentPath === '/retrieve.html' || currentPath === '/info.html') {
    activeLink = document.querySelector('.nav-header nav a[href="/retrieve.html"]');
  }
  // Docs pages
  else if (currentPath.startsWith('/docs/')) {
    activeLink = document.querySelector('.nav-header nav a[href="/docs/"]');
  }
  
  // Apply active class
  if (activeLink) {
    activeLink.classList.add('nav-active');
  }
}

/**
 * Update sidebar active navigation indicator based on current page
 */
function updateSidebarActiveNavigation() {
  const currentPath = window.location.pathname;
  const sidebarLinks = document.querySelectorAll('.dashboard-sidebar nav a');
  
  // Remove existing active states
  sidebarLinks.forEach(link => {
    link.classList.remove('nav-active');
  });
  
  // Find and activate the matching sidebar link
  sidebarLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (currentPath === href || currentPath.startsWith(href.replace('.html', '')))) {
      link.classList.add('nav-active');
    }
  });
}

// Export functions for global access
window.app = {
  updateBalance,
  getCurrentAuthState,
  getCachedBalance,
  updateActiveNavigation,
  updateSidebarActiveNavigation
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
