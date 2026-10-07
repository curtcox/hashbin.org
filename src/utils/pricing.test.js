/**
 * Pricing Calculator Tests (P0 Priority)
 * Tests for src/utils/pricing.js
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRetentionCost,
  calculateStripeFees,
  calculateTotalWithFees,
  checkBalanceSufficient,
  formatCents,
} from './pricing.js';

describe('Pricing Calculator - P0 Tests', () => {
  // PRICE-19: Inline content (≤64 bytes) returns cost of 0
  describe('PRICE-19: Inline content pricing', () => {
    it('should return $0 for content ≤64 bytes', () => {
      expect(calculateRetentionCost(0, 1)).toBe(0);
      expect(calculateRetentionCost(32, 1)).toBe(0);
      expect(calculateRetentionCost(64, 1)).toBe(0);
    });

    it('should return $0 for inline content regardless of retention period', () => {
      expect(calculateRetentionCost(64, 1)).toBe(0);
      expect(calculateRetentionCost(64, 12)).toBe(0);
      expect(calculateRetentionCost(64, 60)).toBe(0);
    });
  });

  // PRICE-20: No minimum charge; cost rounds up to the next whole cent
  describe('PRICE-20: No minimum charge', () => {
    it('charges $0.01 for tiny non-inline content', () => {
      expect(calculateRetentionCost(65, 1)).toBe(1);
      expect(calculateRetentionCost(1024, 1)).toBe(1);
      expect(calculateRetentionCost(100 * 1024, 1)).toBe(1);
    });

    it('rounds partial cents up, never down to zero', () => {
      // 10 MB × 1 month = $0.000293 → $0.01
      expect(calculateRetentionCost(10 * 1024 * 1024, 1)).toBe(1);
      // 50 MB × 12 months = $0.0176 → $0.02
      expect(calculateRetentionCost(50 * 1024 * 1024, 12)).toBe(2);
    });
  });

  // PRICE-01: Calculate cost for 1 GB for 1 month
  describe('PRICE-01: 1 GB × 1 month calculation', () => {
    it('should calculate cost for 1 GB for 1 month', () => {
      const oneGB = 1024 * 1024 * 1024;
      // 1 GB × 1 month × $0.03 = 3 cents
      expect(calculateRetentionCost(oneGB, 1)).toBe(3);
      // 1 GB × 12 months = 36 cents (matches the pricing page)
      expect(calculateRetentionCost(oneGB, 12)).toBe(36);
    });

    it('should not inflate exact amounts through float noise', () => {
      // 100 GB × 1 month = $3.00 exactly
      const hundredGB = 100 * 1024 * 1024 * 1024;
      expect(calculateRetentionCost(hundredGB, 1)).toBe(300);
    });
  });

  // PRICE-06: Calculate Stripe fee (2.9% + $0.30)
  describe('PRICE-06: Stripe fee calculation', () => {
    it('should calculate correct Stripe fees for $100 deposit', () => {
      const result = calculateStripeFees(10000); // $100.00
      
      // Fee = (10000 × 0.029) + 30 = 290 + 30 = 320 cents ($3.20)
      expect(result.feeCents).toBe(320);
      expect(result.grossCents).toBe(10000);
      expect(result.netCents).toBe(9680); // $96.80
    });

    it('should calculate correct Stripe fees for $1 deposit', () => {
      const result = calculateStripeFees(100); // $1.00
      
      // Fee = (100 × 0.029) + 30 = 2.9 + 30 = 33 cents (rounded)
      expect(result.feeCents).toBe(33);
      expect(result.netCents).toBe(67); // $0.67
    });

    it('should calculate total charge with fees correctly', () => {
      const result = calculateTotalWithFees(10000); // Want $100 credit
      
      // Fee = (10000 × 0.029) + 30 = 320 cents
      // Total = 10000 + 320 = 10320 cents ($103.20)
      expect(result.creditCents).toBe(10000);
      expect(result.feeCents).toBe(320);
      expect(result.totalChargeCents).toBe(10320);
    });
  });

  // PRICE-15: Round final price to nearest cent
  describe('PRICE-15: Cent rounding', () => {
    it('should round calculated prices to nearest cent', () => {
      // Test with size that creates fractional cents
      const sizeBytes = 1234567890; // ~1.15 GB
      const costCents = calculateRetentionCost(sizeBytes, 1);
      
      // Result should be a whole number of cents
      expect(Number.isInteger(costCents)).toBe(true);
      expect(costCents % 1).toBe(0);
    });

    it('should round Stripe fees to nearest cent', () => {
      const result = calculateStripeFees(1000); // $10.00
      
      // Fee = (1000 × 0.029) + 30 = 29 + 30 = 59 cents
      expect(Number.isInteger(result.feeCents)).toBe(true);
      expect(result.feeCents).toBe(59);
    });
  });

  // PRICE-16: Avoid floating point errors
  describe('PRICE-16: Floating point precision', () => {
    it('should use integer cents internally to avoid float errors', () => {
      // Classic float error: 0.1 + 0.2 !== 0.3
      // Using cents avoids this
      const result1 = calculateRetentionCost(100 * 1024 * 1024, 1);
      const result2 = calculateRetentionCost(100 * 1024 * 1024, 1);
      
      expect(result1).toBe(result2);
      expect(Number.isInteger(result1)).toBe(true);
    });

    it('should handle multiple calculations without accumulating errors', () => {
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(calculateRetentionCost(1024 * 1024, 1));
      }
      
      // All results should be identical (no accumulated error)
      const first = results[0];
      expect(results.every(r => r === first)).toBe(true);
    });

    it('should format cents correctly without float errors', () => {
      expect(formatCents(100)).toBe('$1.00');
      expect(formatCents(150)).toBe('$1.50');
      expect(formatCents(333)).toBe('$3.33');
      expect(formatCents(1)).toBe('$0.01');
    });
  });

  // Additional validation tests
  describe('Additional pricing validations', () => {
    it('should reject negative size', () => {
      expect(() => calculateRetentionCost(-1, 1)).toThrow('Size and retention must be non-negative');
    });

    it('should reject negative retention months', () => {
      expect(() => calculateRetentionCost(1024, -1)).toThrow('Size and retention must be non-negative');
    });

    it('should enforce minimum retention of 1 month', () => {
      expect(() => calculateRetentionCost(1024, 0)).toThrow('Minimum retention is 1 month(s)');
    });

    it('should check balance sufficiency correctly', () => {
      const oneGB = 1024 * 1024 * 1024;
      // 1 GB for 12 months costs 36 cents; 500 cents is enough
      const result = checkBalanceSufficient(500, oneGB, 12);
      expect(result.sufficient).toBe(true);
      expect(result.required).toBe(36);
      expect(result.shortfall).toBe(0);
    });

    it('should detect insufficient balance', () => {
      const oneGB = 1024 * 1024 * 1024;
      // 1 GB for 12 months costs 36 cents; 10 cents is not enough
      const result = checkBalanceSufficient(10, oneGB, 12);
      expect(result.sufficient).toBe(false);
      expect(result.required).toBe(36);
      expect(result.shortfall).toBe(26);
    });
  });
});

describe('Donation months', () => {
  it('buys whole months, rounded down', async () => {
    const { calculateDonationMonths } = await import('./pricing.js');
    const oneGB = 1024 * 1024 * 1024;
    // $1 at $0.03/GB/month for 1 GB = 33.3 months → 33
    expect(calculateDonationMonths(100, oneGB)).toBe(33);
    // $1 for 50 GB = 0.67 months → 0 (too small)
    expect(calculateDonationMonths(100, 50 * oneGB)).toBe(0);
  });

  it('caps at 100 years and refuses inline content', async () => {
    const { calculateDonationMonths, MAX_DONATION_MONTHS } = await import('./pricing.js');
    expect(calculateDonationMonths(100, 65)).toBe(MAX_DONATION_MONTHS);
    expect(calculateDonationMonths(100, 64)).toBe(0);
  });

  it('sets the minimum donation to one month of retention, at least $1', async () => {
    const { minimumDonationCents } = await import('./pricing.js');
    const oneGB = 1024 * 1024 * 1024;
    expect(minimumDonationCents(1024)).toBe(100);
    expect(minimumDonationCents(100 * oneGB)).toBe(300);
  });
});
