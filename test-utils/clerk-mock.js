/**
 * Mock utilities for Clerk authentication in tests
 * Provides mock implementations for @clerk/backend functions
 */

/**
 * Mock verifyToken function for Clerk JWT validation
 * @param {string} token - JWT token to verify
 * @returns {Promise<object>} Verified token payload
 */
export async function mockVerifyToken(token) {
  if (token === 'valid_token') {
    return {
      sub: 'user_123',
      sid: 'sess_456',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }
  
  if (token === 'expired_token') {
    throw new Error('Token expired');
  }
  
  if (token === 'invalid_token' || token === 'alg_none_token') {
    throw new Error('Invalid token');
  }
  
  throw new Error('Token validation failed');
}

/**
 * Mock Clerk client for testing
 */
export const mockClerkClient = {
  verifyToken: mockVerifyToken,
};

/**
 * Create a valid test JWT token payload
 * @param {object} overrides - Override default values
 * @returns {object} JWT payload
 */
export function createValidJWTPayload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'user_123',
    sid: 'sess_456',
    iat: now,
    exp: now + 3600,
    iss: 'https://clerk.hashbin.org',
    ...overrides,
  };
}

/**
 * Create an expired JWT token payload
 * @param {object} overrides - Override default values
 * @returns {object} JWT payload
 */
export function createExpiredJWTPayload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'user_123',
    sid: 'sess_456',
    iat: now - 7200,
    exp: now - 3600,
    iss: 'https://clerk.hashbin.org',
    ...overrides,
  };
}

/**
 * Check if a session is fresh (within 5 minutes)
 * @param {number} iat - Issued at timestamp
 * @returns {boolean} True if session is fresh
 */
export function isSessionFresh(iat) {
  const now = Math.floor(Date.now() / 1000);
  const sessionAge = now - iat;
  return sessionAge <= 300; // 5 minutes
}
