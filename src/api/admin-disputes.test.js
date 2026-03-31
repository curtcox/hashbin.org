/**
 * Admin Disputes API Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock environment bindings
 */
function createMockEnv(isAdmin = true) {
  return {
    ADMIN_USER_ID: isAdmin ? 'admin-user-123' : null,
    DISPUTE_INDEX: {
      idFromName: vi.fn(() => 'mock-index-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/list') {
            return new Response(JSON.stringify({
              disputes: [
                {
                  cid: 'test-cid-1',
                  dispute_id: 'disp-123',
                  claim_type: 'copyright',
                  created_at: '2024-01-01T00:00:00Z',
                  expires_at: '2024-01-31T00:00:00Z'
                }
              ],
              total: 1,
              cache_info: {
                last_modified: '2024-01-01T00:00:00Z'
              }
            }), { status: 200 });
          }
          if (url.pathname === '/remove') {
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
                  cid: 'test-cid-1',
                  status: 'open',
                  claim_type: 'copyright',
                  evidence: 'Evidence text',
                  evidence_urls: ['https://example.com/proof'],
                  created_at: '2024-01-01T00:00:00Z',
                  updated_at: '2024-01-01T00:00:00Z',
                  expires_at: '2024-01-31T00:00:00Z',
                  submitter_contact: {
                    type: 'email',
                    value: 'reporter@example.com'
                  }
                }
              }), { status: 200 });
            }
            if (request.method === 'PATCH') {
              return new Response(JSON.stringify({
                dispute: {
                  dispute_id: 'disp-123',
                  status: 'closed_denied',
                  resolution: 'denied',
                  resolution_reason: 'Insufficient evidence',
                  resolved_by: 'admin'
                }
              }), { status: 200 });
            }
          }
          return new Response('Not Found', { status: 404 });
        })
      }))
    },
    ADMIN_ACTION_LOG: {
      idFromName: vi.fn(() => 'mock-log-id'),
      get: vi.fn(() => ({
        fetch: vi.fn(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/log') {
            return new Response(JSON.stringify({ 
              success: true,
              action_id: 'action-123'
            }), { status: 201 });
          }
          if (url.pathname === '/actions') {
            return new Response(JSON.stringify({
              actions: [
                {
                  action_id: 'action-123',
                  admin_user_id: 'admin-user-123',
                  action_type: 'content_deleted',
                  timestamp: '2024-01-01T00:00:00Z',
                  target_cid: 'test-cid',
                  target_dispute_id: 'disp-123',
                  details: {
                    reason: 'Violation'
                  }
                }
              ],
              total: 1,
              limit: 50,
              offset: 0
            }), { status: 200 });
          }
          return new Response('Not Found', { status: 404 });
        })
      }))
    },
    CONTENT_BUCKET: {
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    }
  };
}

/**
 * Import handlers
 */
import { 
  handleAdminListDisputes,
  handleAdminUpdateDispute,
  handleGetAdminActions
} from './admin-disputes.js';

describe('Admin Disputes API', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv(true);
  });

  describe('GET /api/admin/disputes', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = new Request('http://localhost/api/admin/disputes', {
        method: 'GET'
      });

      const response = await handleAdminListDisputes(request, mockEnv);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user is not admin', async () => {
      const request = new Request('http://localhost/api/admin/disputes', {
        method: 'GET'
      });
      request.user = { userId: 'regular-user-456' };

      const response = await handleAdminListDisputes(request, mockEnv);
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('NOT_ADMIN');
    });

    it('should return all disputes with full details for admin', async () => {
      const request = new Request('http://localhost/api/admin/disputes', {
        method: 'GET'
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleAdminListDisputes(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.disputes).toHaveLength(1);
      expect(data.disputes[0].dispute_id).toBe('disp-123');
      expect(data.disputes[0].submitter_contact).toBeDefined();
      expect(data.disputes[0].submitter_contact.value).toBe('reporter@example.com');
    });

    it('should support filtering by claim_type', async () => {
      const request = new Request('http://localhost/api/admin/disputes?claim_type=copyright', {
        method: 'GET'
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleAdminListDisputes(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.disputes).toBeDefined();
    });

    it('should support pagination', async () => {
      const request = new Request('http://localhost/api/admin/disputes?limit=10&offset=0', {
        method: 'GET'
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleAdminListDisputes(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });
  });

  describe('PATCH /api/admin/disputes/{cid}', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = new Request('http://localhost/api/admin/disputes/test-cid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'closed_denied',
          resolution_reason: 'Insufficient evidence'
        })
      });

      const response = await handleAdminUpdateDispute(request, mockEnv, 'test-cid');
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user is not admin', async () => {
      const request = new Request('http://localhost/api/admin/disputes/test-cid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'closed_denied',
          resolution_reason: 'Insufficient evidence'
        })
      });
      request.user = { userId: 'regular-user-456' };

      const response = await handleAdminUpdateDispute(request, mockEnv, 'test-cid');
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('NOT_ADMIN');
    });

    it('should update dispute status with valid data', async () => {
      const request = new Request('http://localhost/api/admin/disputes/test-cid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'closed_denied',
          resolution_reason: 'Insufficient evidence provided'
        })
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleAdminUpdateDispute(request, mockEnv, 'test-cid');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.dispute.status).toBe('closed_denied');
      expect(data.dispute.resolved_by).toBe('admin');
    });

    it('should return 400 for invalid status', async () => {
      const request = new Request('http://localhost/api/admin/disputes/test-cid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'invalid_status',
          resolution_reason: 'Test'
        })
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleAdminUpdateDispute(request, mockEnv, 'test-cid');
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('INVALID_STATUS');
      expect(data.valid_statuses).toBeDefined();
    });

    it('should log admin action when updating dispute', async () => {
      const request = new Request('http://localhost/api/admin/disputes/test-cid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'closed_denied',
          resolution_reason: 'Insufficient evidence'
        })
      });
      request.user = { userId: 'admin-user-123' };

      const logFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ success: true }), { status: 201 });
      });

      mockEnv.ADMIN_ACTION_LOG.get = vi.fn(() => ({
        fetch: logFetch
      }));

      const response = await handleAdminUpdateDispute(request, mockEnv, 'test-cid');
      expect(response.status).toBe(200);

      // Verify admin action was logged
      expect(logFetch).toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/actions', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = new Request('http://localhost/api/admin/actions', {
        method: 'GET'
      });

      const response = await handleGetAdminActions(request, mockEnv);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user is not admin', async () => {
      const request = new Request('http://localhost/api/admin/actions', {
        method: 'GET'
      });
      request.user = { userId: 'regular-user-456' };

      const response = await handleGetAdminActions(request, mockEnv);
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe('NOT_ADMIN');
    });

    it('should return admin action log for admin', async () => {
      const request = new Request('http://localhost/api/admin/actions', {
        method: 'GET'
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleGetAdminActions(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.actions).toHaveLength(1);
      expect(data.actions[0].action_id).toBe('action-123');
      expect(data.actions[0].admin_user_id).toBe('admin-user-123');
    });

    it('should support filtering by action_type', async () => {
      const request = new Request('http://localhost/api/admin/actions?action_type=content_deleted', {
        method: 'GET'
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleGetAdminActions(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.actions).toBeDefined();
    });

    it('should support pagination', async () => {
      const request = new Request('http://localhost/api/admin/actions?limit=20&offset=10', {
        method: 'GET'
      });
      request.user = { userId: 'admin-user-123' };

      const response = await handleGetAdminActions(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      // Verify pagination parameters were passed through
      expect(data.actions).toBeDefined();
      expect(data.total).toBeDefined();
    });
  });
});
