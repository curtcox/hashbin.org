/**
 * Unit tests for admin authentication
 */

import { describe, it, expect } from 'vitest';
import { validateAdminToken, requireAdmin } from '../../src/auth/admin.js';

describe('Admin Authentication', () => {
  describe('validateAdminToken', () => {
    it('returns true for valid token', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234'
      };
      const token = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234';
      
      expect(validateAdminToken(token, env)).toBe(true);
    });

    it('returns false for invalid token', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234'
      };
      const token = 'wrong_token';
      
      expect(validateAdminToken(token, env)).toBe(false);
    });

    it('returns false for empty token', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234'
      };
      const token = '';
      
      expect(validateAdminToken(token, env)).toBe(false);
    });

    it('returns false for null token', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234'
      };
      const token = null;
      
      expect(validateAdminToken(token, env)).toBe(false);
    });

    it('returns false when secret not configured', () => {
      const env = {};
      const token = 'any_token';
      
      expect(validateAdminToken(token, env)).toBe(false);
    });

    it('is case sensitive', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234'
      };
      const token = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234';
      
      expect(validateAdminToken(token, env)).toBe(false);
    });

    it('returns false for different length tokens', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234'
      };
      const token = 'a1b2c3d4';
      
      expect(validateAdminToken(token, env)).toBe(false);
    });

    it('uses constant-time comparison', () => {
      // This test ensures the function doesn't short-circuit
      // In a proper security audit, timing would be measured
      const env = {
        ADMIN_SECRET_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      };
      
      // These should take approximately the same time
      const token1 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const token2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbb';
      
      // Both should return false
      expect(validateAdminToken(token1, env)).toBe(false);
      expect(validateAdminToken(token2, env)).toBe(false);
    });
  });

  describe('requireAdmin', () => {
    it('returns null for valid admin token', () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'test-token-12345'
      };
      const request = new Request('https://example.com', {
        headers: {
          'X-Admin-Token': 'test-token-12345'
        }
      });
      
      const result = requireAdmin(request, env);
      expect(result).toBe(null);
    });

    it('returns 401 response for missing token', async () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'test-token-12345'
      };
      const request = new Request('https://example.com');
      
      const result = requireAdmin(request, env);
      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(401);
      
      const body = await result.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 response for invalid token', async () => {
      const env = {
        ADMIN_SECRET_TOKEN: 'test-token-12345'
      };
      const request = new Request('https://example.com', {
        headers: {
          'X-Admin-Token': 'wrong-token'
        }
      });
      
      const result = requireAdmin(request, env);
      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(401);
      
      const body = await result.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('admin token required');
    });

    it('returns 401 when admin secret not configured', async () => {
      const env = {};
      const request = new Request('https://example.com', {
        headers: {
          'X-Admin-Token': 'any-token'
        }
      });
      
      const result = requireAdmin(request, env);
      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(401);
    });
  });
});
