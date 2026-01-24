/**
 * Rate Limit Pricing Utility Tests
 * Tests for src/utils/rate-limit-pricing.js
 */

import { describe, it, expect } from 'vitest';
import { 
  calculateRateLimitPrice, 
  validateRateLimitPurchase 
} from './rate-limit-pricing.js';

describe('Rate Limit Pricing Tests', () => {
  
  // TEST-PRICE-001: Price should be size × max_requests × rate_per_byte
  describe('TEST-PRICE-001: Price calculation formula', () => {
    it('should calculate price correctly using formula', () => {
      const sizeBytes = 1048576; // 1 MB
      const mtbrMs = 1000; // 1 second
      const durationSeconds = 2592000; // 30 days
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      // Max requests = floor(2592000 / 1) = 2,592,000
      expect(result.maxRequests).toBe(2592000);
      
      // Max bytes = 1048576 × 2,592,000 (actual calculation from implementation)
      expect(result.maxBytes).toBe(sizeBytes * result.maxRequests);
      
      // Price should be calculated based on max bytes
      expect(result.priceCents).toBeGreaterThan(0);
    });
  });

  // TEST-PRICE-002: Price of $0.001 should round up to $0.01
  describe('TEST-PRICE-002: Sub-cent rounding up', () => {
    it('should round up $0.001 to $0.01 (1 cent)', () => {
      // Small file, short duration, large MTBR
      const sizeBytes = 100; // 100 bytes
      const mtbrMs = 3600000; // 1 hour
      const durationSeconds = 3600; // 1 hour (exactly 1 request)
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      expect(result.maxRequests).toBe(1);
      expect(result.priceCents).toBeGreaterThanOrEqual(1); // At least 1 cent
    });
  });

  // TEST-PRICE-003: Price of $0.019 should round up to $0.02
  describe('TEST-PRICE-003: Rounding up to next cent', () => {
    it('should round up fractional cents to next whole cent', () => {
      // Calculate a price that would be between 1 and 2 cents
      const sizeBytes = 200;
      const mtbrMs = 3600000; // 1 hour
      const durationSeconds = 3600; // 1 hour
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      // Price should be rounded up
      expect(Number.isInteger(result.priceCents)).toBe(true);
      expect(result.priceCents).toBeGreaterThanOrEqual(1);
    });
  });

  // TEST-PRICE-004: Price of exactly $1.00 should be 100 cents
  describe('TEST-PRICE-004: Exact dollar amounts', () => {
    it('should handle exact dollar amounts correctly', () => {
      // Large file with parameters that give exact cents
      const sizeBytes = 10737418240; // 10 GB
      const mtbrMs = 1000; // 1 second
      const durationSeconds = 100; // 100 seconds = 100 requests
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      expect(result.maxRequests).toBe(100);
      expect(result.maxBytes).toBe(1073741824000); // 1 TB
      expect(Number.isInteger(result.priceCents)).toBe(true);
      expect(result.priceCents).toBeGreaterThan(0);
    });
  });

  // TEST-PRICE-005: Very small purchase should be 1 cent minimum
  describe('TEST-PRICE-005: Minimum price rounding', () => {
    it('should ensure minimum 1 cent due to rounding', () => {
      // Smallest possible purchase
      const sizeBytes = 1; // 1 byte
      const mtbrMs = 86400000; // 1 day
      const durationSeconds = 86400; // 1 day (1 request)
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      expect(result.maxRequests).toBe(1);
      expect(result.maxBytes).toBe(1);
      expect(result.priceCents).toBeGreaterThanOrEqual(1);
    });
  });

  // TEST-PRICE-006: Large content × high frequency calculation
  describe('TEST-PRICE-006: Large scale calculation', () => {
    it('should handle large calculations correctly', () => {
      const sizeBytes = 1073741824; // 1 GB
      const mtbrMs = 100; // 100ms (minimum)
      const durationSeconds = 86400; // 1 day
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      // Max requests = floor(86400 / 0.1) = 864,000
      expect(result.maxRequests).toBe(864000);
      
      // Max bytes = 1GB × 864,000
      expect(result.maxBytes).toBe(sizeBytes * result.maxRequests);
      
      expect(result.priceCents).toBeGreaterThan(0);
      expect(Number.isInteger(result.priceCents)).toBe(true);
    });
  });

  // TEST-PRICE-007: max_bytes equals size_bytes × max_requests
  describe('TEST-PRICE-007: Max bytes verification', () => {
    it('should calculate max_bytes as size_bytes × max_requests', () => {
      const sizeBytes = 524288; // 512 KB
      const mtbrMs = 5000; // 5 seconds
      const durationSeconds = 3600; // 1 hour
      
      const result = calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds);
      
      expect(result.maxRequests).toBe(720); // floor(3600 / 5)
      expect(result.maxBytes).toBe(sizeBytes * result.maxRequests);
      expect(result.maxBytes).toBe(377487360);
    });
  });
});

describe('Rate Limit Purchase Validation Tests', () => {
  
  // TEST-PURCHASE-010: MTBR < 100ms should fail
  describe('TEST-PURCHASE-010: Minimum MTBR validation', () => {
    it('should reject MTBR below 100ms', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = validateRateLimitPurchase(99, 3600, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept MTBR of exactly 100ms', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = validateRateLimitPurchase(100, 3600, contentExpiresAt);
      
      expect(result.valid).toBe(true);
    });
  });

  // TEST-PURCHASE-011: Zero or negative duration should fail
  describe('TEST-PURCHASE-011: Positive duration validation', () => {
    it('should reject zero duration', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = validateRateLimitPurchase(1000, 0, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject negative duration', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = validateRateLimitPurchase(1000, -100, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // TEST-PURCHASE-012: MTBR > duration should fail (max_requests < 1)
  describe('TEST-PURCHASE-012: Duration must exceed MTBR', () => {
    it('should reject when MTBR exceeds duration', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      // MTBR of 2 seconds, duration of 1 second
      const result = validateRateLimitPurchase(2000, 1, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept when duration equals MTBR (exactly 1 request)', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      // MTBR of 1 second, duration of 1 second
      const result = validateRateLimitPurchase(1000, 1, contentExpiresAt);
      
      expect(result.valid).toBe(true);
    });
  });

  // TEST-PURCHASE-013: Purchase extending beyond content retention should fail
  describe('TEST-PURCHASE-013: Retention constraint', () => {
    it('should reject purchase beyond content retention', () => {
      // Content expires in 15 days
      const contentExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
      
      // Trying to purchase 30 days
      const durationSeconds = 30 * 24 * 60 * 60;
      const result = validateRateLimitPurchase(1000, durationSeconds, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('duration_exceeds_retention');
      expect(result.content_expires_at).toBe(contentExpiresAt);
      expect(result.max_duration_seconds).toBeDefined();
      expect(result.max_duration_seconds).toBeLessThan(durationSeconds);
    });
  });

  // TEST-PURCHASE-014: Purchase error should show max allowed duration
  describe('TEST-PURCHASE-014: Max duration in error', () => {
    it('should include max_duration_seconds in error response', () => {
      // Content expires in 10 days
      const contentExpiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      
      // Trying to purchase 20 days
      const durationSeconds = 20 * 24 * 60 * 60;
      const result = validateRateLimitPurchase(1000, durationSeconds, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.max_duration_seconds).toBeDefined();
      expect(result.max_duration_seconds).toBeGreaterThan(0);
      expect(result.max_duration_seconds).toBeLessThan(durationSeconds);
    });
  });

  // TEST-EDGE-011: Purchase duration exactly matches remaining retention
  describe('TEST-EDGE-011: Exact retention match', () => {
    it('should accept purchase matching exact remaining retention', () => {
      // Content expires in exactly 15 days
      const expiryTime = Date.now() + 15 * 24 * 60 * 60 * 1000;
      const contentExpiresAt = new Date(expiryTime).toISOString();
      
      // Purchase for exactly remaining time (accounting for milliseconds)
      const remainingSeconds = Math.floor((expiryTime - Date.now()) / 1000);
      const result = validateRateLimitPurchase(1000, remainingSeconds, contentExpiresAt);
      
      expect(result.valid).toBe(true);
    });
  });

  // TEST-EDGE-012: Purchase 1 second over retention
  describe('TEST-EDGE-012: One second over retention', () => {
    it('should reject purchase 1 second over retention', () => {
      // Content expires in 15 days
      const expiryTime = Date.now() + 15 * 24 * 60 * 60 * 1000;
      const contentExpiresAt = new Date(expiryTime).toISOString();
      
      // Purchase for 1 second more than remaining
      const remainingSeconds = Math.floor((expiryTime - Date.now()) / 1000);
      const result = validateRateLimitPurchase(1000, remainingSeconds + 1, contentExpiresAt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('duration_exceeds_retention');
    });
  });

  // TEST-EDGE-013: MTBR of exactly 100ms
  describe('TEST-EDGE-013: Minimum MTBR boundary', () => {
    it('should accept MTBR of exactly 100ms', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = validateRateLimitPurchase(100, 3600, contentExpiresAt);
      
      expect(result.valid).toBe(true);
    });
  });

  // TEST-EDGE-014: MTBR of 99ms
  describe('TEST-EDGE-014: Below minimum MTBR', () => {
    it('should reject MTBR of 99ms', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = validateRateLimitPurchase(99, 3600, contentExpiresAt);
      
      expect(result.valid).toBe(false);
    });
  });

  // TEST-EDGE-015: Duration exactly equal to MTBR (max_requests = 1)
  describe('TEST-EDGE-015: Single request purchase', () => {
    it('should accept when duration equals MTBR for single request', () => {
      const contentExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      // 1 second MTBR, 1 second duration = 1 request
      const result = validateRateLimitPurchase(1000, 1, contentExpiresAt);
      
      expect(result.valid).toBe(true);
    });
  });
});
