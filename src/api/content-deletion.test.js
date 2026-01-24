/**
 * Content Deletion API Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock environment bindings
 */
function createMockEnv() {
  const storage = new Map();
  
  return {
    ADMIN_USER_ID: 'admin-user-123',
    CONTENT_METADATA: {
      idFromName: vi.fn(() => 'mock-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/content') {
            return new Response(JSON.stringify({
              hash_256t: 'test-cid',
              uploader_id: 'user-456',
              size_bytes: 1024,
              content_type: 'text/plain',
              deleted_at: null
            }), { status: 200 });
          }
          if (url.pathname === '/soft-delete') {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }
          return new Response('Not Found', { status: 404 });
        })
      }))
    },
    DISPUTE_RECORD: {
      idFromName: vi.fn(() => 'mock-dispute-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/dispute') {
            if (request.method === 'GET') {
              return new Response(JSON.stringify({
                dispute: {
                  dispute_id: 'disp-123',
                  cid: 'test-cid',
                  status: 'open'
                }
              }), { status: 200 });
            }
            if (request.method === 'PATCH') {
              return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
          }
          return new Response('Not Found', { status: 404 });
        })
      }))
    },
    DISPUTE_INDEX: {
      idFromName: vi.fn(() => 'mock-index-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        })
      }))
    },
    PAYMENT_RECORD: {
      idFromName: vi.fn(() => 'mock-payment-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/transactions') {
            return new Response(JSON.stringify({
              transactions: [{ balance_after_cents: 10000 }]
            }), { status: 200 });
          }
          if (url.pathname === '/transaction') {
            return new Response(JSON.stringify({ success: true }), { status: 201 });
          }
          return new Response('Not Found', { status: 404 });
        })
      }))
    },
    DELETION_RECORD: {
      idFromName: vi.fn(() => 'mock-deletion-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        })
      }))
    },
    ADMIN_ACTION_LOG: {
      idFromName: vi.fn(() => 'mock-log-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => {
          return new Response(JSON.stringify({ success: true }), { status: 201 });
        })
      }))
    }
  };
}

/**
 * Import handlers
 */
import { handleDeleteContent, handleAdminDeleteContent } from './content-deletion.js';

describe('Content Deletion API', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  describe('DELETE /api/content/{cid}', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = new Request('http://localhost/api/content/test-cid', {
        method: 'DELETE'
      });

      const response = await handleDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should allow uploader to delete their content', async () => {
      const request = new Request('http://localhost/api/content/test-cid', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      request.user = { userId: 'user-456' };

      const response = await handleDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.deleted.deleted_by).toBe('uploader');
    });

    it('should allow admin to delete any content', async () => {
      const request = new Request('http://localhost/api/content/test-cid', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.deleted.deleted_by).toBe('admin');
    });

    it('should return 403 if user is not uploader or admin', async () => {
      const request = new Request('http://localhost/api/content/test-cid', {
        method: 'DELETE'
      });
      request.user = { userId: 'other-user-789' };

      const response = await handleDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('FORBIDDEN');
    });

    it('should return 404 if content does not exist', async () => {
      const request = new Request('http://localhost/api/content/nonexistent', {
        method: 'DELETE'
      });
      request.user = { userId: 'user-456' };

      // Mock content not found
      mockEnv.CONTENT_METADATA.get = vi.fn(() => ({
        fetch: vi.fn(async () => {
          return new Response('Not Found', { status: 404 });
        })
      }));

      const response = await handleDeleteContent(request, mockEnv, 'nonexistent');
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe('NOT_FOUND');
    });

    it('should return 410 if content is already deleted', async () => {
      const request = new Request('http://localhost/api/content/test-cid', {
        method: 'DELETE'
      });
      request.user = { userId: 'user-456' };

      // Mock already deleted content
      mockEnv.CONTENT_METADATA.get = vi.fn(() => ({
        fetch: vi.fn(async () => {
          return new Response(JSON.stringify({
            hash_256t: 'test-cid',
            uploader_id: 'user-456',
            deleted_at: '2024-01-01T00:00:00Z'
          }), { status: 200 });
        })
      }));

      const response = await handleDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(410);

      const data = await response.json();
      expect(data.error).toBe('ALREADY_DELETED');
    });

    it('should accept optional reason in request body', async () => {
      const request = new Request('http://localhost/api/content/test-cid', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'No longer needed' })
      });
      request.user = { userId: 'user-456' };

      const response = await handleDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/admin/content/{cid}/delete', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = new Request('http://localhost/api/admin/content/test-cid/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Violation of terms' })
      });

      const response = await handleAdminDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user is not admin', async () => {
      const request = new Request('http://localhost/api/admin/content/test-cid/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Violation of terms' })
      });
      request.user = { userId: 'regular-user-456' };

      const response = await handleAdminDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('NOT_ADMIN');
    });

    it('should allow admin to delete with custom reason', async () => {
      const request = new Request('http://localhost/api/admin/content/test-cid/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: 'Violation of terms',
          dispute_id: 'disp-123'
        })
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleAdminDeleteContent(request, mockEnv, 'test-cid');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.deleted.deleted_by).toBe('admin');
    });
  });
});
