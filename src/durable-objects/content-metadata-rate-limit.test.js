/**
 * ContentMetadata Durable Object - Rate Limit Tests
 * Tests for rate limiting operations in src/durable-objects/content-metadata.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentMetadata } from './content-metadata.js';

/**
 * Helper to create mock Durable Object state with in-memory storage
 */
function createMockState(initialData = {}) {
  const storage = new Map();
  
  // Initialize with content if provided
  if (initialData.content) {
    storage.set('content', initialData.content);
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

/**
 * Helper to create content metadata with rate limiting fields
 */
function createContentWithRateLimit(overrides = {}) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  return {
    hash_256t: '00000008YWJjZGVmZ2g',
    size_bytes: 1024,
    uploader_id: 'user_123',
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    last_served_at: null,
    rate_limit_records: [],
    default_rate_limit: {
      min_time_between_requests_ms: 30 * 24 * 60 * 60 * 1000, // 30 days
      expires_at: thirtyDaysFromNow.toISOString()
    },
    ...overrides,
  };
}

describe('ContentMetadata Rate Limit Tests', () => {
  let mockState;
  let mockEnv;
  let contentMetadata;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = {
      ENVIRONMENT: 'test',
    };
    contentMetadata = new ContentMetadata(mockState, mockEnv);
  });

  // TEST-DEFAULT-001: Newly uploaded non-inline CID should have 30-day MTBR default
  describe('TEST-DEFAULT-001: Default rate limit for new uploads', () => {
    it('should set 30-day MTBR for non-inline content on creation', async () => {
      const now = Date.now();
      const request = new Request('http://test.com/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: '00000008YWJjZGVmZ2g',
          size_bytes: 1024, // Non-inline (> 64 bytes)
          uploader_id: 'user_123',
          retention_months: 12,
          amount_cents: 100,
          payment_id: 'pay_123'
        })
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(201); // Content creation returns 201

      const data = await response.json();
      expect(data.default_rate_limit).toBeDefined();
      expect(data.default_rate_limit.min_time_between_requests_ms).toBe(30 * 24 * 60 * 60 * 1000);
      
      // Verify expires_at is approximately 30 days from now
      const expiresAt = new Date(data.default_rate_limit.expires_at).getTime();
      const expectedExpiry = now + (30 * 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000); // Within 5 seconds
    });

    it('should NOT set default rate limit for inline content', async () => {
      const request = new Request('http://test.com/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: '00000008YWJj',
          size_bytes: 64, // Inline (≤ 64 bytes)
          uploader_id: 'user_123',
          retention_months: 12,
          amount_cents: 0,
          payment_id: 'pay_123'
        })
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(201); // Content creation returns 201

      const data = await response.json();
      expect(data.default_rate_limit).toBeNull();
    });
  });

  // TEST-DEFAULT-003: First request after upload should succeed
  describe('TEST-DEFAULT-003: First request with null last_served_at', () => {
    it('should allow first request when last_served_at is null', async () => {
      const content = createContentWithRateLimit();
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit/check', {
        method: 'POST'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.allowed).toBe(true);
      // The response doesn't include last_served_at, but it should be updated in storage
      expect(data.next_available_at).toBeDefined();
      expect(data.effective_mtbr_ms).toBeDefined();
    });
  });

  // TEST-DEFAULT-004: Second request immediately after first should fail with 429
  describe('TEST-DEFAULT-004: Immediate second request', () => {
    it('should return 429 for second request before MTBR elapsed', async () => {
      const content = createContentWithRateLimit({
        last_served_at: new Date().toISOString() // Just served
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit/check', {
        method: 'POST'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error).toBe('rate_limit_exceeded');
      expect(data.retry_after_seconds).toBeDefined();
      expect(data.next_available_at).toBeDefined();
    });
  });

  // TEST-EXISTING-001: CID with no default_rate_limit should return 429
  describe('TEST-EXISTING-001: Existing CID without default rate limit', () => {
    it('should return 429 for CID with no default_rate_limit', async () => {
      const content = createContentWithRateLimit({
        default_rate_limit: null,
        rate_limit_records: []
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit/check', {
        method: 'POST'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error).toBe('rate_limit_exceeded');
      expect(data.next_available_at).toBeNull(); // Infinite MTBR
    });
  });

  // TEST-MTBR-001: Single active rate limit should be effective
  describe('TEST-MTBR-001: Single active rate limit', () => {
    it('should use single purchased rate limit', async () => {
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      const content = createContentWithRateLimit({
        default_rate_limit: null,
        rate_limit_records: [{
          record_id: 'rec_123',
          payer_id: 'user_456',
          min_time_between_requests_ms: 1000, // 1 second
          starts_at: now.toISOString(),
          expires_at: futureExpiry.toISOString(),
          max_requests: 604800,
          max_bytes: 629145600,
          price_cents: 629,
          created_at: now.toISOString()
        }],
        last_served_at: null
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit', {
        method: 'GET'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.effective_mtbr_ms).toBe(1000);
      expect(data.active_rate_limits).toHaveLength(1);
    });
  });

  // TEST-MTBR-002: Multiple active rate limits should use lowest MTBR
  describe('TEST-MTBR-002: Multiple active rate limits', () => {
    it('should use lowest MTBR when multiple rate limits active', async () => {
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const content = createContentWithRateLimit({
        default_rate_limit: null,
        rate_limit_records: [
          {
            record_id: 'rec_1',
            payer_id: 'user_1',
            min_time_between_requests_ms: 5000, // 5 seconds
            starts_at: now.toISOString(),
            expires_at: futureExpiry.toISOString(),
            max_requests: 120960,
            max_bytes: 123863040,
            price_cents: 124,
            created_at: now.toISOString()
          },
          {
            record_id: 'rec_2',
            payer_id: 'user_2',
            min_time_between_requests_ms: 1000, // 1 second (lowest)
            starts_at: now.toISOString(),
            expires_at: futureExpiry.toISOString(),
            max_requests: 604800,
            max_bytes: 619724800,
            price_cents: 620,
            created_at: now.toISOString()
          },
          {
            record_id: 'rec_3',
            payer_id: 'user_3',
            min_time_between_requests_ms: 10000, // 10 seconds
            starts_at: now.toISOString(),
            expires_at: futureExpiry.toISOString(),
            max_requests: 60480,
            max_bytes: 61972480,
            price_cents: 62,
            created_at: now.toISOString()
          }
        ]
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit', {
        method: 'GET'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.effective_mtbr_ms).toBe(1000); // Lowest MTBR
      expect(data.active_rate_limits).toHaveLength(3);
    });
  });

  // TEST-MTBR-003: Expired rate limit should not be considered
  describe('TEST-MTBR-003: Expired rate limits', () => {
    it('should ignore expired rate limit records', async () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Yesterday
      const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const content = createContentWithRateLimit({
        default_rate_limit: null,
        rate_limit_records: [
          {
            record_id: 'rec_expired',
            payer_id: 'user_1',
            min_time_between_requests_ms: 100, // Expired, but lower
            starts_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            expires_at: pastExpiry.toISOString(),
            max_requests: 100,
            max_bytes: 102400,
            price_cents: 1,
            created_at: pastExpiry.toISOString()
          },
          {
            record_id: 'rec_active',
            payer_id: 'user_2',
            min_time_between_requests_ms: 5000, // Active
            starts_at: now.toISOString(),
            expires_at: futureExpiry.toISOString(),
            max_requests: 120960,
            max_bytes: 123863040,
            price_cents: 124,
            created_at: now.toISOString()
          }
        ]
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit', {
        method: 'GET'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.effective_mtbr_ms).toBe(5000); // Only active rate limit
      expect(data.active_rate_limits).toHaveLength(1);
    });
  });

  // TEST-MTBR-004: Future rate limit should not be considered
  describe('TEST-MTBR-004: Future rate limits', () => {
    it('should ignore future rate limit records not yet started', async () => {
      const now = new Date();
      const futureStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
      const futureExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      const content = createContentWithRateLimit({
        default_rate_limit: null,
        rate_limit_records: [
          {
            record_id: 'rec_future',
            payer_id: 'user_1',
            min_time_between_requests_ms: 100, // Future, but lower
            starts_at: futureStart.toISOString(),
            expires_at: futureExpiry.toISOString(),
            max_requests: 100,
            max_bytes: 102400,
            price_cents: 1,
            created_at: now.toISOString()
          }
        ]
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit', {
        method: 'GET'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.is_rate_limited).toBe(true); // No active rate limits
      expect(data.effective_mtbr_ms).toBe(null);
      expect(data.active_rate_limits).toHaveLength(0);
    });
  });

  // TEST-MTBR-007: Mix of default and purchased rate limits
  describe('TEST-MTBR-007: Default and purchased rate limits', () => {
    it('should use lowest MTBR between default and purchased', async () => {
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const content = createContentWithRateLimit({
        // Default: 30 days MTBR
        rate_limit_records: [
          {
            record_id: 'rec_1',
            payer_id: 'user_1',
            min_time_between_requests_ms: 1000, // 1 second (lowest)
            starts_at: now.toISOString(),
            expires_at: futureExpiry.toISOString(),
            max_requests: 604800,
            max_bytes: 619724800,
            price_cents: 620,
            created_at: now.toISOString()
          }
        ]
      });
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const request = new Request('http://test.com/rate-limit', {
        method: 'GET'
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.effective_mtbr_ms).toBe(1000); // Purchased is lower than default
    });
  });

  // TEST-PURCHASE-001: Valid purchase should create rate limit record
  describe('TEST-PURCHASE-001: Rate limit purchase', () => {
    it('should create rate limit record on successful purchase', async () => {
      const content = createContentWithRateLimit();
      mockState = createMockState({ content });
      contentMetadata = new ContentMetadata(mockState, mockEnv);

      const now = new Date();
      const request = new Request('http://test.com/rate-limit/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          record_id: 'rec_new',
          payer_id: 'user_456',
          min_time_between_requests_ms: 1000,
          duration_seconds: 604800, // 7 days
          max_requests: 604800,
          max_bytes: 619724800,
          price_cents: 620
        })
      });

      const response = await contentMetadata.fetch(request);
      expect(response.status).toBe(201); // Purchase returns 201

      const data = await response.json();
      expect(data.record_id).toBe('rec_new');
      expect(data.starts_at).toBeDefined();
      expect(data.expires_at).toBeDefined();

      // Verify record was added
      const statusRequest = new Request('http://test.com/rate-limit', {
        method: 'GET'
      });
      const statusResponse = await contentMetadata.fetch(statusRequest);
      const statusData = await statusResponse.json();
      
      expect(statusData.active_rate_limits).toHaveLength(1);
      expect(statusData.active_rate_limits[0].record_id).toBe('rec_new');
    });
  });
});
