/**
 * DeletionRecord Durable Object Tests
 * Tests for deletion record storage and retrieval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeletionRecord } from './deletion-record.js';

/**
 * Helper to create mock Durable Object state with in-memory storage
 */
function createMockState(initialData = {}) {
  const storage = new Map();
  
  // Initialize with any initial data
  for (const [key, value] of Object.entries(initialData)) {
    storage.set(key, value);
  }
  
  return {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key),
    },
    blockConcurrencyWhile: async (callback) => await callback(),
  };
}

describe('DeletionRecord Durable Object', () => {
  let mockState;
  let mockEnv;
  let deletionRecord;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = {
      ENVIRONMENT: 'test',
    };
    deletionRecord = new DeletionRecord(mockState, mockEnv);
  });

  describe('Create deletion record', () => {
    it('should create a new deletion record', async () => {
      const request = new Request('http://test.com/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash-123',
          reason: 'expired',
          uploader_id: 'user_123',
          size_bytes: 1024,
          content_type: 'text/plain'
        }),
      });

      const response = await deletionRecord.fetch(request);
      
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.hash_256t).toBe('test-hash-123');
      expect(data.reason).toBe('expired');
      expect(data.uploader_id_hash).toBeDefined();
      expect(data.uploader_id_hash).not.toBe('user_123'); // Should be hashed
      expect(data.size_bytes).toBe(1024);
      expect(data.content_type).toBe('text/plain');
      expect(data.deleted_at).toBeDefined();
    });

    it('should be idempotent - return existing record on duplicate', async () => {
      const requestData = {
        hash_256t: 'test-hash-123',
        reason: 'expired',
        uploader_id: 'user_123',
        size_bytes: 1024,
        content_type: 'text/plain'
      };

      // First request
      const request1 = new Request('http://test.com/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestData),
      });
      const response1 = await deletionRecord.fetch(request1);
      expect(response1.status).toBe(201);
      const data1 = await response1.json();

      // Second request with same hash
      const request2 = new Request('http://test.com/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestData),
      });
      const response2 = await deletionRecord.fetch(request2);
      expect(response2.status).toBe(200); // Not 201
      const data2 = await response2.json();

      // Should return same record
      expect(data2.hash_256t).toBe(data1.hash_256t);
      expect(data2.deleted_at).toBe(data1.deleted_at);
    });

    it('should hash uploader ID for privacy', async () => {
      const request = new Request('http://test.com/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash-123',
          reason: 'expired',
          uploader_id: 'user_123',
        }),
      });

      const response = await deletionRecord.fetch(request);
      const data = await response.json();
      
      // Uploader ID should be hashed (16 character hex)
      expect(data.uploader_id_hash).toMatch(/^[0-9a-f]{16}$/);
      // Should not be the raw user ID
      expect(data.uploader_id_hash).not.toBe('user_123');
    });
  });

  describe('Get deletion records', () => {
    beforeEach(async () => {
      // Create some test deletion records
      for (let i = 1; i <= 5; i++) {
        const request = new Request('http://test.com/record', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: `test-hash-${i}`,
            reason: i % 2 === 0 ? 'expired' : 'contested',
            uploader_id: `user_${i}`,
          }),
        });
        await deletionRecord.fetch(request);
      }
    });

    it('should list deletion records with pagination', async () => {
      const request = new Request('http://test.com/records?limit=3&offset=0', {
        method: 'GET'
      });

      const response = await deletionRecord.fetch(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.deletions).toHaveLength(3);
      expect(data.total).toBe(5);
      expect(data.limit).toBe(3);
      expect(data.offset).toBe(0);
    });

    it('should filter deletion records by reason', async () => {
      const request = new Request('http://test.com/records?reason=expired', {
        method: 'GET'
      });

      const response = await deletionRecord.fetch(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      // Should only return expired deletions (hashes 2, 4)
      expect(data.deletions.length).toBeGreaterThan(0);
      data.deletions.forEach(deletion => {
        expect(deletion.reason).toBe('expired');
      });
    });
  });

  describe('Get specific deletion record', () => {
    it('should retrieve a specific deletion record by hash', async () => {
      // Create a deletion record
      const createRequest = new Request('http://test.com/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'specific-hash',
          reason: 'expired',
          uploader_id: 'user_123',
        }),
      });
      await deletionRecord.fetch(createRequest);

      // Retrieve it
      const getRequest = new Request('http://test.com/record/specific-hash', {
        method: 'GET'
      });

      const response = await deletionRecord.fetch(getRequest);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.hash_256t).toBe('specific-hash');
      expect(data.reason).toBe('expired');
    });

    it('should return 404 for non-existent deletion record', async () => {
      const request = new Request('http://test.com/record/nonexistent', {
        method: 'GET'
      });

      const response = await deletionRecord.fetch(request);
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBe('Deletion record not found');
    });
  });

  describe('Deletion statistics', () => {
    it('should track deletion counts by reason', async () => {
      // Create deletions with different reasons
      const reasons = ['expired', 'expired', 'contested', 'admin_action'];
      
      for (let i = 0; i < reasons.length; i++) {
        const request = new Request('http://test.com/record', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: `test-hash-${i}`,
            reason: reasons[i],
            uploader_id: `user_${i}`,
          }),
        });
        await deletionRecord.fetch(request);
      }

      // Get stats
      const statsRequest = new Request('http://test.com/stats', {
        method: 'GET'
      });

      const response = await deletionRecord.fetch(statsRequest);
      expect(response.status).toBe(200);
      
      const stats = await response.json();
      expect(stats.total_deletions).toBe(4);
      expect(stats.by_reason.expired).toBe(2);
      expect(stats.by_reason.contested).toBe(1);
      expect(stats.by_reason.admin_action).toBe(1);
      expect(stats.last_updated).toBeDefined();
    });

    it('should return empty stats for no deletions', async () => {
      const request = new Request('http://test.com/stats', {
        method: 'GET'
      });

      const response = await deletionRecord.fetch(request);
      expect(response.status).toBe(200);
      
      const stats = await response.json();
      expect(stats.total_deletions).toBe(0);
      expect(stats.by_reason).toEqual({});
    });
  });
});
