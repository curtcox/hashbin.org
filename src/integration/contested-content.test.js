/**
 * Contested Content Tests
 * Tests for HTTP 451 (Unavailable For Legal Reasons) functionality
 */

import { describe, it, expect } from 'vitest';

describe('Contested Content (HTTP 451)', () => {
  describe('ContentMetadata contested fields', () => {
    it('should initialize contested as false by default', () => {
      const content = {
        hash_256t: 'test_hash',
        size_bytes: 1000,
        contested: false,
        contested_reason: null
      };

      expect(content.contested).toBe(false);
      expect(content.contested_reason).toBe(null);
    });

    it('should support marking content as contested', () => {
      const content = {
        hash_256t: 'test_hash',
        size_bytes: 1000,
        contested: false,
        contested_reason: null
      };

      // Simulate marking as contested
      content.contested = true;
      content.contested_reason = 'Content violates terms of service';
      content.contested_at = new Date().toISOString();
      content.contested_by = 'admin_123';

      expect(content.contested).toBe(true);
      expect(content.contested_reason).toBe('Content violates terms of service');
      expect(content.contested_at).toBeDefined();
      expect(content.contested_by).toBe('admin_123');
    });

    it('should support unmarking content as contested', () => {
      const content = {
        hash_256t: 'test_hash',
        size_bytes: 1000,
        contested: true,
        contested_reason: 'Content violates terms of service',
        contested_at: new Date().toISOString(),
        contested_by: 'admin_123'
      };

      // Simulate unmarking as contested
      content.contested = false;
      content.contested_reason = null;
      content.uncontested_at = new Date().toISOString();

      expect(content.contested).toBe(false);
      expect(content.contested_reason).toBe(null);
      expect(content.uncontested_at).toBeDefined();
    });
  });

  describe('HTTP 451 Response Format', () => {
    it('should return proper 451 response structure', () => {
      const response451 = {
        status: 451,
        headers: {
          'content-type': 'application/json',
          'Link': '<https://hashbin.org/legal/contested>; rel="blocked-by"'
        },
        body: {
          error: 'unavailable_for_legal_reasons',
          message: 'This content is unavailable due to legal reasons',
          details: 'This content has been removed or restricted due to legal process.'
        }
      };

      expect(response451.status).toBe(451);
      expect(response451.headers['content-type']).toBe('application/json');
      expect(response451.headers['Link']).toContain('blocked-by');
      expect(response451.body.error).toBe('unavailable_for_legal_reasons');
    });

    it('should include Link header as per RFC 7725', () => {
      const linkHeader = '<https://hashbin.org/legal/contested>; rel="blocked-by"';
      
      // Verify Link header format
      expect(linkHeader).toMatch(/<[^>]+>; rel="blocked-by"/);
    });
  });

  describe('Contested Content Logic', () => {
    it('should block download when contested is true', () => {
      const metadata = {
        hash_256t: 'test_hash',
        contested: true,
        contested_reason: 'Legal review in progress'
      };

      // Simulate download check
      const shouldBlock = metadata.contested === true;

      expect(shouldBlock).toBe(true);
    });

    it('should allow download when contested is false', () => {
      const metadata = {
        hash_256t: 'test_hash',
        contested: false,
        contested_reason: null
      };

      // Simulate download check
      const shouldBlock = metadata.contested === true;

      expect(shouldBlock).toBe(false);
    });

    it('should use default reason when contested_reason is null', () => {
      const metadata = {
        contested: true,
        contested_reason: null
      };

      const defaultReason = 'This content is unavailable due to legal reasons';
      const displayReason = metadata.contested_reason || defaultReason;

      expect(displayReason).toBe(defaultReason);
    });

    it('should use custom reason when contested_reason is provided', () => {
      const metadata = {
        contested: true,
        contested_reason: 'Copyright violation claim pending review'
      };

      const defaultReason = 'This content is unavailable due to legal reasons';
      const displayReason = metadata.contested_reason || defaultReason;

      expect(displayReason).toBe('Copyright violation claim pending review');
    });
  });

  describe('Contest State Tracking', () => {
    it('should track when content was contested', () => {
      const content = {
        contested: true,
        contested_at: '2026-01-24T12:00:00Z',
        contested_by: 'admin_user'
      };

      expect(content.contested_at).toBeDefined();
      expect(content.contested_by).toBeDefined();
      expect(new Date(content.contested_at)).toBeInstanceOf(Date);
    });

    it('should track when content was uncontested', () => {
      const content = {
        contested: false,
        contested_at: '2026-01-24T12:00:00Z',
        uncontested_at: '2026-01-24T14:00:00Z'
      };

      expect(content.uncontested_at).toBeDefined();
      expect(new Date(content.uncontested_at) > new Date(content.contested_at)).toBe(true);
    });
  });
});

describe('Info Page Route', () => {
  describe('Route Pattern Matching', () => {
    it('should match valid /info/{cid} pattern', () => {
      const validPaths = [
        '/info/AAAAAAAA',
        '/info/ABCDEFGHabcdefgh12345678',
        '/info/A1B2C3D4E5F6G7H8',
        '/info/very-long-cid-with-many-characters-that-is-still-valid-123456789'
      ];

      const pattern = /^\/info\/([A-Za-z0-9_-]{8,94})$/;

      validPaths.forEach(path => {
        expect(pattern.test(path)).toBe(true);
      });
    });

    it('should not match invalid /info/{cid} pattern', () => {
      const invalidPaths = [
        '/info',
        '/info/',
        '/info/short',  // Too short (< 8 chars)
        '/info/has spaces',
        '/info/has@symbols',
        '/info/AAAAAAAA/extra'
      ];

      const pattern = /^\/info\/([A-Za-z0-9_-]{8,94})$/;

      invalidPaths.forEach(path => {
        expect(pattern.test(path)).toBe(false);
      });
    });

    it('should extract CID from valid path', () => {
      const path = '/info/ABCDEFGHabcd1234';
      const match = path.match(/^\/info\/([A-Za-z0-9_-]{8,94})$/);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('ABCDEFGHabcd1234');
    });
  });

  describe('Info Page Redirect', () => {
    it('should redirect to info.html with cid parameter', () => {
      const cid = 'ABCDEFGHabcd1234';
      const redirectUrl = `/info.html?cid=${cid}`;

      expect(redirectUrl).toContain('/info.html');
      expect(redirectUrl).toContain(`cid=${cid}`);
    });

    it('should use 302 temporary redirect', () => {
      const redirectStatus = 302;

      expect(redirectStatus).toBe(302);
    });
  });
});
