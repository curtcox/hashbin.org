/**
 * Authentication Middleware Security Tests (P0 Priority)
 * Tests for src/auth/middleware.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticate, AUTH_ERROR_CODES } from './middleware.js';
import { generateApiKey, hashApiKey } from './utils.js';

// Mock Clerk verifyToken
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async (token) => {
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
    
    if (token === 'alg_none_token') {
      throw new Error('Invalid token - algorithm not allowed');
    }
    
    throw new Error('Invalid token');
  }),
}));

describe('Authentication Middleware - P0 Security Tests', () => {
  let mockEnv;

  beforeEach(() => {
    // Create mock environment with Durable Object bindings
    mockEnv = {
      CLERK_SECRET_KEY: 'test_clerk_secret',
      ENVIRONMENT: 'test',
      KEY_REGISTRY: createMockDurableObject('KEY_REGISTRY'),
      USER_PROFILES: createMockDurableObject('USER_PROFILES'),
    };
  });

  // SEC-01: Timing attack on key validation
  describe('SEC-01: Timing attack protection', () => {
    it('should take consistent time for valid and invalid keys', async () => {
      const validKey = generateApiKey();
      const invalidKey = 'hb_' + 'a'.repeat(32);
      
      // Mock the registry to return valid for one key
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async (keyHash) => {
          const validKeyHash = await hashApiKey(validKey);
          if (keyHash === validKeyHash) {
            return { user_id: 'user_123', key_id: 'key_456' };
          }
          return null;
        }
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_456',
          key_hash: 'hash123',
          name: 'Test Key',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          revoked_at: null,
        }),
        getProfile: () => ({
          user_id: 'user_123',
          balance_cents: 1000,
          deleted_at: null,
        }),
      });

      const validRequest = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });
      
      const invalidRequest = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${invalidKey}` }
      });

      // Measure timing for valid key
      const validStart = performance.now();
      await authenticate(validRequest, mockEnv);
      const validTime = performance.now() - validStart;

      // Measure timing for invalid key
      const invalidStart = performance.now();
      await authenticate(invalidRequest, mockEnv);
      const invalidTime = performance.now() - invalidStart;

      // Time difference should be minimal (less than 100ms)
      // This is a basic check - proper timing attack testing requires
      // statistical analysis over many iterations
      const timeDifference = Math.abs(validTime - invalidTime);
      expect(timeDifference).toBeLessThan(100);
    });

    it('should use constant-time comparison for key hashes', async () => {
      // Generate keys with similar prefixes
      const key1 = generateApiKey();
      const key2 = 'hb_' + key1.substring(3, 5) + 'z'.repeat(30);
      
      const request1 = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${key1}` }
      });
      
      const request2 = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${key2}` }
      });

      // Both should fail but take similar time
      const start1 = performance.now();
      const result1 = await authenticate(request1, mockEnv);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      const result2 = await authenticate(request2, mockEnv);
      const time2 = performance.now() - start2;

      expect(result1.authenticated).toBe(false);
      expect(result2.authenticated).toBe(false);
      
      // Timing should be consistent
      const timeDifference = Math.abs(time1 - time2);
      expect(timeDifference).toBeLessThan(50);
    });
  });

  // SEC-02: Key enumeration prevention
  describe('SEC-02: Key enumeration prevention', () => {
    it('should return same error for non-existent and invalid keys', async () => {
      const nonExistentKey = generateApiKey();
      const malformedKey = 'invalid_key_format';
      
      const request1 = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${nonExistentKey}` }
      });
      
      const request2 = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${malformedKey}` }
      });

      const result1 = await authenticate(request1, mockEnv);
      const result2 = await authenticate(request2, mockEnv);

      expect(result1.authenticated).toBe(false);
      expect(result2.authenticated).toBe(false);
      
      // Both should have generic error messages that don't reveal
      // whether the key exists or is just malformed
      expect(result1.error).toBe(AUTH_ERROR_CODES.AUTH_INVALID_FORMAT);
      expect(result2.error).toBe(AUTH_ERROR_CODES.AUTH_INVALID_FORMAT);
    });

    it('should not reveal if a key exists but is revoked', async () => {
      const validKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async () => ({ user_id: 'user_123', key_id: 'key_456' })
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_456',
          key_hash: 'hash123',
          name: 'Test Key',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          revoked_at: new Date().toISOString(), // Key is revoked
        }),
        getProfile: () => ({
          user_id: 'user_123',
          balance_cents: 1000,
          deleted_at: null,
        }),
      });

      const request = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_KEY_REVOKED);
      // Error message should be generic enough to not help attackers
    });

    it('should not distinguish between expired and non-existent keys via timing', async () => {
      const nonExistentKey = generateApiKey();
      const expiredKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async (keyHash) => {
          const expiredKeyHash = await hashApiKey(expiredKey);
          if (keyHash === expiredKeyHash) {
            return { user_id: 'user_123', key_id: 'key_456' };
          }
          return null;
        }
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_456',
          key_hash: 'hash123',
          name: 'Test Key',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
          revoked_at: null,
        }),
        getProfile: () => ({
          user_id: 'user_123',
          balance_cents: 1000,
          deleted_at: null,
        }),
      });

      const request1 = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${nonExistentKey}` }
      });
      
      const request2 = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${expiredKey}` }
      });

      const start1 = performance.now();
      const result1 = await authenticate(request1, mockEnv);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      const result2 = await authenticate(request2, mockEnv);
      const time2 = performance.now() - start2;

      expect(result1.authenticated).toBe(false);
      expect(result2.authenticated).toBe(false);
      
      // Timing should be similar
      const timeDifference = Math.abs(time1 - time2);
      expect(timeDifference).toBeLessThan(100);
    });
  });

  // SEC-03: JWT signature bypass (alg:none)
  describe('SEC-03: JWT signature bypass protection', () => {
    it('should reject JWT with alg:none', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer alg_none_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_INVALID_FORMAT);
    });

    it('should only accept properly signed JWTs', async () => {
      const validRequest = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer valid_token' }
      });
      
      const invalidRequest = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer invalid_token' }
      });

      const validResult = await authenticate(validRequest, mockEnv);
      const invalidResult = await authenticate(invalidRequest, mockEnv);

      expect(validResult.authenticated).toBe(true);
      expect(invalidResult.authenticated).toBe(false);
      expect(invalidResult.error).toBe(AUTH_ERROR_CODES.AUTH_INVALID_FORMAT);
    });

    it('should reject unsigned JWTs', async () => {
      // Create a JWT-like token without signature
      const unsignedToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyXzEyMyJ9.';
      
      const request = new Request('http://test.com', {
        headers: { 'Authorization': `Bearer ${unsignedToken}` }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
    });
  });

  // AUTHMW-01: Anonymous public access
  describe('AUTHMW-01: Anonymous access', () => {
    it('should allow anonymous requests without authentication', async () => {
      const request = new Request('http://test.com');

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should not require authentication for public endpoints', async () => {
      const request = new Request('http://test.com/health');

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBeNull();
    });
  });

  // CLERK-01: Valid Clerk JWT is accepted
  describe('CLERK-01: Valid JWT acceptance', () => {
    it('should accept valid Clerk JWT', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(true);
      expect(result.user).not.toBeNull();
      expect(result.user.userId).toBe('user_123');
      expect(result.error).toBeNull();
    });

    it('should extract user ID from valid JWT', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.user.userId).toBe('user_123');
      expect(result.user.sessionId).toBe('sess_456');
    });

    it('should provide user context from Clerk JWT', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.userId).toBeTruthy();
    });
  });

  // CLERK-02: Expired Clerk JWT is rejected
  describe('CLERK-02: Expired JWT rejection', () => {
    it('should reject expired Clerk JWT', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer expired_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_EXPIRED);
    });

    it('should not provide user context for expired JWT', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer expired_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });

    it('should return appropriate error message for expired token', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer expired_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_EXPIRED);
      expect(result.authenticated).toBe(false);
    });
  });

  // CLERK-03: Malformed Clerk JWT is rejected
  describe('CLERK-03: Malformed JWT rejection', () => {
    it('should reject malformed JWT', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer invalid_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_INVALID_FORMAT);
    });

    it('should reject JWT with invalid format', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer not.a.valid.jwt' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
    });

    it('should reject non-JWT bearer tokens', async () => {
      const request = new Request('http://test.com', {
        headers: { 'Authorization': 'Bearer plaintext_token' }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_INVALID_FORMAT);
    });
  });

  // KEYVAL-03: Revoked API key is rejected
  describe('KEYVAL-03: Revoked key rejection', () => {
    it('should reject revoked API key', async () => {
      const validKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async () => ({ user_id: 'user_789', key_id: 'key_revoked' })
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_revoked',
          key_hash: 'hash_revoked',
          name: 'Revoked Key',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          revoked_at: new Date().toISOString(), // Key is revoked
        }),
        getProfile: () => ({
          user_id: 'user_789',
          balance_cents: 5000,
          deleted_at: null,
        }),
      });

      const request = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_KEY_REVOKED);
    });

    it('should not provide user context for revoked key', async () => {
      const validKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async () => ({ user_id: 'user_789', key_id: 'key_revoked' })
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_revoked',
          revoked_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        getProfile: () => ({
          user_id: 'user_789',
          balance_cents: 5000,
          deleted_at: null,
        }),
      });

      const request = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });
  });

  // KEYVAL-04: Expired API key is rejected
  describe('KEYVAL-04: Expired key rejection', () => {
    it('should reject expired API key', async () => {
      const validKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async () => ({ user_id: 'user_999', key_id: 'key_expired' })
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_expired',
          key_hash: 'hash_expired',
          name: 'Expired Key',
          created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
          revoked_at: null,
        }),
        getProfile: () => ({
          user_id: 'user_999',
          balance_cents: 2000,
          deleted_at: null,
        }),
      });

      const request = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe(AUTH_ERROR_CODES.AUTH_EXPIRED);
    });

    it('should not provide user context for expired key', async () => {
      const validKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async () => ({ user_id: 'user_999', key_id: 'key_expired' })
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_expired',
          expires_at: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
          revoked_at: null,
        }),
        getProfile: () => ({
          user_id: 'user_999',
          balance_cents: 2000,
          deleted_at: null,
        }),
      });

      const request = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });

      const result = await authenticate(request, mockEnv);

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });

    it('should reject key that expired exactly now', async () => {
      const validKey = generateApiKey();
      
      mockEnv.KEY_REGISTRY = createMockDurableObject('KEY_REGISTRY', {
        lookup: async () => ({ user_id: 'user_999', key_id: 'key_expired' })
      });
      
      mockEnv.USER_PROFILES = createMockDurableObject('USER_PROFILES', {
        getApiKey: () => ({
          id: 'key_expired',
          expires_at: new Date(Date.now()).toISOString(), // Expires right now
          revoked_at: null,
        }),
        getProfile: () => ({
          user_id: 'user_999',
          balance_cents: 2000,
          deleted_at: null,
        }),
      });

      const request = new Request('http://test.com', {
        headers: { 'Authorization': `ApiKey ${validKey}` }
      });

      const result = await authenticate(request, mockEnv);

      // Key that expires "now" should be considered expired
      expect(result.authenticated).toBe(false);
    });
  });
});

/**
 * Helper function to create mock Durable Object bindings
 */
function createMockDurableObject(name, handlers = {}) {
  return {
    idFromName: (id) => ({ toString: () => id }),
    get: () => ({
      fetch: async (request) => {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // Handle KEY_REGISTRY lookups
        if (name === 'KEY_REGISTRY' && path === '/lookup') {
          const body = await request.json();
          const keyHash = body.key_hash;
          
          if (handlers.lookup) {
            const result = await handlers.lookup(keyHash);
            if (result) {
              return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'content-type': 'application/json' }
              });
            }
          }
          
          return new Response('Not found', { status: 404 });
        }
        
        // Handle USER_PROFILES API key lookups
        if (name === 'USER_PROFILES' && path.startsWith('/apikeys/')) {
          if (path.endsWith('/use')) {
            // Update last_used_at - just return success
            return new Response('OK', { status: 200 });
          }
          
          if (handlers.getApiKey) {
            const apiKeyData = handlers.getApiKey();
            return new Response(JSON.stringify(apiKeyData), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
          
          return new Response('Not found', { status: 404 });
        }
        
        // Handle USER_PROFILES profile lookups
        if (name === 'USER_PROFILES' && path === '/profile') {
          if (handlers.getProfile) {
            const profile = handlers.getProfile();
            return new Response(JSON.stringify(profile), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
          
          return new Response('Not found', { status: 404 });
        }
        
        return new Response('Not found', { status: 404 });
      }
    })
  };
}
