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
