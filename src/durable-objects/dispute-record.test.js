/**
 * DisputeRecord Durable Object Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Create mock Durable Object state
 */
function createMockState() {
  const storage = new Map();
  
  return {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key)
    }
  };
}

/**
 * Create mock environment
 */
function createMockEnv() {
  return {};
}

/**
 * Import DisputeRecord class
 */
import { DisputeRecord } from './dispute-record.js';

describe('DisputeRecord Durable Object', () => {
  let disputeRecord;
  let mockState;
  let mockEnv;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = createMockEnv();
    disputeRecord = new DisputeRecord(mockState, mockEnv);
  });

  describe('Create dispute', () => {
    it('should create dispute with valid data', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long to meet the minimum requirement.',
          evidence_urls: ['https://example.com/proof'],
          contact: {
            type: 'email',
            value: 'reporter@example.com'
          },
          submitter_ip_hash: 'hashed-ip-123'
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.dispute.dispute_id).toMatch(/^disp_/);
      expect(data.dispute.cid).toBe('test-cid-123');
      expect(data.dispute.status).toBe('open');
      expect(data.dispute.expires_at).toBeDefined();
    });

    it('should reject dispute with missing CID', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('CID_REQUIRED');
    });

    it('should reject dispute with invalid claim_type', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'invalid-type',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('INVALID_CLAIM_TYPE');
    });

    it('should reject dispute with evidence too short', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'Too short',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('EVIDENCE_TOO_SHORT');
    });

    it('should reject dispute with evidence too long', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'A'.repeat(10001),
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('EVIDENCE_TOO_LONG');
    });

    it('should reject dispute with too many evidence URLs', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          evidence_urls: Array(11).fill('https://example.com/proof'),
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('TOO_MANY_EVIDENCE_URLS');
    });

    it('should reject dispute with non-HTTPS evidence URL', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          evidence_urls: ['http://example.com/proof'],
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('INVALID_EVIDENCE_URL');
    });

    it('should reject dispute with missing contact info', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.'
        })
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('CONTACT_REQUIRED');
    });

    it('should reject duplicate dispute for same CID', async () => {
      // Create first dispute
      const request1 = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      await disputeRecord.fetch(request1);

      // Try to create duplicate
      const request2 = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'harassment',
          evidence: 'This is a different evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter2@example.com' }
        })
      });

      const response = await disputeRecord.fetch(request2);
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.error).toBe('DISPUTE_EXISTS');
    });
  });

  describe('Get dispute', () => {
    it('should get active dispute', async () => {
      // Create dispute first
      const createRequest = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      await disputeRecord.fetch(createRequest);

      // Get dispute
      const getRequest = new Request('http://localhost/dispute', {
        method: 'GET'
      });

      const response = await disputeRecord.fetch(getRequest);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.dispute_id).toBeDefined();
      expect(data.status).toBe('open');
    });

    it('should return 404 when no active dispute', async () => {
      const request = new Request('http://localhost/dispute', {
        method: 'GET'
      });

      const response = await disputeRecord.fetch(request);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe('NO_ACTIVE_DISPUTE');
    });
  });

  describe('Update dispute', () => {
    it('should update dispute status', async () => {
      // Create dispute first
      const createRequest = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      await disputeRecord.fetch(createRequest);

      // Update status
      const updateRequest = new Request('http://localhost/dispute', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'under_review'
        })
      });

      const response = await disputeRecord.fetch(updateRequest);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.dispute.status).toBe('under_review');
    });

    it('should close dispute when status is closed_*', async () => {
      // Create dispute
      const createRequest = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      await disputeRecord.fetch(createRequest);

      // Close dispute
      const updateRequest = new Request('http://localhost/dispute', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'closed_denied',
          resolution: 'denied',
          resolution_reason: 'Insufficient evidence',
          resolved_by: 'admin'
        })
      });

      const response = await disputeRecord.fetch(updateRequest);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.dispute.closed_at).toBeDefined();
      expect(data.dispute.resolution).toBe('denied');
    });
  });

  describe('Re-dispute rate limiting', () => {
    it('should enforce 30-day re-dispute cooldown', async () => {
      // Create and close a dispute
      const createRequest = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      await disputeRecord.fetch(createRequest);

      // Close it
      const closeRequest = new Request('http://localhost/dispute', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'closed_denied',
          resolution: 'denied',
          resolved_by: 'admin'
        })
      });

      await disputeRecord.fetch(closeRequest);

      // Try to create new dispute immediately
      const redisputeRequest = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'harassment',
          evidence: 'This is a different evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter2@example.com' }
        })
      });

      const response = await disputeRecord.fetch(redisputeRequest);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error).toBe('REDISPUTE_TOO_SOON');
      expect(data.days_remaining).toBeDefined();
      expect(data.days_remaining).toBeGreaterThan(0);
    });
  });

  describe('Dispute history', () => {
    it('should track all disputes for a CID', async () => {
      // Create first dispute
      const request1 = new Request('http://localhost/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'test-cid-123',
          claim_type: 'copyright',
          evidence: 'This is a detailed evidence description that is more than 50 characters long.',
          contact: { type: 'email', value: 'reporter@example.com' }
        })
      });

      await disputeRecord.fetch(request1);

      // Get history
      const historyRequest = new Request('http://localhost/history', {
        method: 'GET'
      });

      const response = await disputeRecord.fetch(historyRequest);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.disputes).toHaveLength(1);
      expect(data.total).toBe(1);
    });
  });
});
