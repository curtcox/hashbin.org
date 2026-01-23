/**
 * ExpirationIndex Durable Object Tests
 * Tests for expiration date indexing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExpirationIndex } from './expiration-index.js';

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
      list: async () => storage,
      deleteAll: async () => storage.clear(),
    },
    blockConcurrencyWhile: async (callback) => await callback(),
  };
}

describe('ExpirationIndex Durable Object', () => {
  let mockState;
  let mockEnv;
  let expirationIndex;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = {
      ENVIRONMENT: 'test',
    };
    expirationIndex = new ExpirationIndex(mockState, mockEnv);
  });

  describe('Register content', () => {
    it('should register content with expiration date', async () => {
      const request = new Request('http://test.com/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash-1',
          expires_at: '2026-01-23T00:00:00.000Z'
        }),
      });

      const response = await expirationIndex.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.date).toBe('2026-01-23');
    });

    it('should group multiple hashes by same date', async () => {
      // Register multiple hashes for same date
      for (let i = 1; i <= 3; i++) {
        const request = new Request('http://test.com/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: `test-hash-${i}`,
            expires_at: '2026-01-23T00:00:00.000Z'
          }),
        });
        await expirationIndex.fetch(request);
      }

      // Check that all hashes are registered
      const getRequest = new Request('http://test.com/expired?date=2026-01-23', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(getRequest);
      const data = await response.json();
      
      expect(data.count).toBe(3);
      expect(data.hashes).toContain('test-hash-1');
      expect(data.hashes).toContain('test-hash-2');
      expect(data.hashes).toContain('test-hash-3');
    });

    it('should be idempotent - registering twice should not duplicate', async () => {
      const requestData = {
        hash_256t: 'test-hash-1',
        expires_at: '2026-01-23T00:00:00.000Z'
      };

      // Register twice
      for (let i = 0; i < 2; i++) {
        const request = new Request('http://test.com/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestData),
        });
        await expirationIndex.fetch(request);
      }

      // Should only have one entry
      const getRequest = new Request('http://test.com/expired?date=2026-01-23', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(getRequest);
      const data = await response.json();
      
      expect(data.count).toBe(1);
    });
  });

  describe('Unregister content', () => {
    beforeEach(async () => {
      // Register some test content
      for (let i = 1; i <= 3; i++) {
        const request = new Request('http://test.com/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: `test-hash-${i}`,
            expires_at: '2026-01-23T00:00:00.000Z'
          }),
        });
        await expirationIndex.fetch(request);
      }
    });

    it('should unregister specific content', async () => {
      const request = new Request('http://test.com/unregister', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash-2',
          expires_at: '2026-01-23T00:00:00.000Z'
        }),
      });

      const response = await expirationIndex.fetch(request);
      expect(response.status).toBe(200);

      // Verify hash is removed
      const getRequest = new Request('http://test.com/expired?date=2026-01-23', {
        method: 'GET'
      });
      const getResponse = await expirationIndex.fetch(getRequest);
      const data = await getResponse.json();
      
      expect(data.count).toBe(2);
      expect(data.hashes).not.toContain('test-hash-2');
      expect(data.hashes).toContain('test-hash-1');
      expect(data.hashes).toContain('test-hash-3');
    });

    it('should clean up empty date entries', async () => {
      // Unregister all hashes
      for (let i = 1; i <= 3; i++) {
        const request = new Request('http://test.com/unregister', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: `test-hash-${i}`,
            expires_at: '2026-01-23T00:00:00.000Z'
          }),
        });
        await expirationIndex.fetch(request);
      }

      // Date entry should be removed
      const getRequest = new Request('http://test.com/expired?date=2026-01-23', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(getRequest);
      const data = await response.json();
      
      expect(data.count).toBe(0);
      expect(data.hashes).toEqual([]);
    });
  });

  describe('Update expiration', () => {
    it('should move hash from old date to new date', async () => {
      // Register with initial date
      const registerRequest = new Request('http://test.com/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash',
          expires_at: '2026-01-23T00:00:00.000Z'
        }),
      });
      await expirationIndex.fetch(registerRequest);

      // Update to new date
      const updateRequest = new Request('http://test.com/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash',
          old_expires_at: '2026-01-23T00:00:00.000Z',
          new_expires_at: '2026-02-23T00:00:00.000Z'
        }),
      });
      const response = await expirationIndex.fetch(updateRequest);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.old_date).toBe('2026-01-23');
      expect(data.new_date).toBe('2026-02-23');

      // Verify hash moved
      const oldDateRequest = new Request('http://test.com/expired?date=2026-01-23', {
        method: 'GET'
      });
      const oldDateResponse = await expirationIndex.fetch(oldDateRequest);
      const oldDateData = await oldDateResponse.json();
      expect(oldDateData.count).toBe(0);

      const newDateRequest = new Request('http://test.com/expired?date=2026-02-23', {
        method: 'GET'
      });
      const newDateResponse = await expirationIndex.fetch(newDateRequest);
      const newDateData = await newDateResponse.json();
      expect(newDateData.count).toBe(1);
      expect(newDateData.hashes).toContain('test-hash');
    });

    it('should handle same date update (no-op)', async () => {
      // Register with date
      const registerRequest = new Request('http://test.com/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash',
          expires_at: '2026-01-23T10:00:00.000Z'
        }),
      });
      await expirationIndex.fetch(registerRequest);

      // Update to same date (different time)
      const updateRequest = new Request('http://test.com/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: 'test-hash',
          old_expires_at: '2026-01-23T10:00:00.000Z',
          new_expires_at: '2026-01-23T15:00:00.000Z'
        }),
      });
      const response = await expirationIndex.fetch(updateRequest);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.unchanged).toBe(true);
    });
  });

  describe('Get expired content', () => {
    it('should return hashes expiring on specific date', async () => {
      // Register content for different dates
      const dates = ['2026-01-23', '2026-01-24', '2026-01-25'];
      
      for (let i = 0; i < dates.length; i++) {
        const request = new Request('http://test.com/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: `hash-${i}`,
            expires_at: `${dates[i]}T00:00:00.000Z`
          }),
        });
        await expirationIndex.fetch(request);
      }

      // Get expired for specific date
      const getRequest = new Request('http://test.com/expired?date=2026-01-24', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(getRequest);
      const data = await response.json();
      
      expect(data.date).toBe('2026-01-24');
      expect(data.count).toBe(1);
      expect(data.hashes).toContain('hash-1');
    });

    it('should return empty array for date with no expirations', async () => {
      const request = new Request('http://test.com/expired?date=2099-12-31', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(request);
      const data = await response.json();
      
      expect(data.count).toBe(0);
      expect(data.hashes).toEqual([]);
    });

    it('should require date parameter', async () => {
      const request = new Request('http://test.com/expired', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(request);
      
      expect(response.status).toBe(400);
    });
  });

  describe('Get statistics', () => {
    it('should return statistics about indexed dates', async () => {
      // Register content for multiple dates
      const testData = [
        { date: '2026-01-23', count: 3 },
        { date: '2026-01-24', count: 2 },
        { date: '2026-01-25', count: 1 }
      ];

      for (const { date, count } of testData) {
        for (let i = 0; i < count; i++) {
          const request = new Request('http://test.com/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              hash_256t: `${date}-hash-${i}`,
              expires_at: `${date}T00:00:00.000Z`
            }),
          });
          await expirationIndex.fetch(request);
        }
      }

      // Get stats
      const request = new Request('http://test.com/stats', {
        method: 'GET'
      });
      const response = await expirationIndex.fetch(request);
      const stats = await response.json();
      
      expect(stats.total_dates).toBe(3);
      expect(stats.dates).toHaveLength(3);
      
      // Verify counts
      const date1 = stats.dates.find(d => d.date === '2026-01-23');
      expect(date1.count).toBe(3);
      
      const date2 = stats.dates.find(d => d.date === '2026-01-24');
      expect(date2.count).toBe(2);
      
      const date3 = stats.dates.find(d => d.date === '2026-01-25');
      expect(date3.count).toBe(1);
    });
  });
});
