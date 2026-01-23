/**
 * Pricing Calculator Tests (P0 Priority)
 * Tests for src/utils/pricing.js
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRetentionCost,
  calculateMinimumRetentionCost,
  calculateStripeFees,
  calculateTotalWithFees,
  checkBalanceSufficient,
  formatCents,
  BASE_RATE_PER_GB_PER_MONTH,
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

  // PRICE-20: Content >64 bytes has minimum cost of $2.00
  describe('PRICE-20: Minimum cost enforcement', () => {
    it('should return $2.00 minimum for content >64 bytes', () => {
      const minimumCostCents = 200; // $2.00
      
      // 65 bytes (just over threshold)
      expect(calculateRetentionCost(65, 1)).toBe(minimumCostCents);
      
      // 1 KB for 1 month (calculated cost would be less than $2)
      expect(calculateRetentionCost(1024, 1)).toBe(minimumCostCents);
      
      // 100 KB for 1 month
      expect(calculateRetentionCost(100 * 1024, 1)).toBe(minimumCostCents);
    });
  });

  // PRICE-21: Small content returns $2.00 minimum, not calculated rate
  describe('PRICE-21: Small content minimum cost', () => {
    it('should apply $2.00 minimum for 1KB for 1 month', () => {
      const costCents = calculateRetentionCost(1024, 1);
      expect(costCents).toBe(200); // $2.00 minimum
      
      // Verify calculated cost would be less than minimum
      const sizeGB = 1024 / (1024 * 1024 * 1024);
      const calculatedCents = Math.round(sizeGB * 1 * BASE_RATE_PER_GB_PER_MONTH * 100);
      expect(calculatedCents).toBeLessThan(200);
    });

    it('should apply $2.00 minimum for small files with short retention', () => {
      // 10 MB for 1 month
      expect(calculateRetentionCost(10 * 1024 * 1024, 1)).toBe(200);
      
      // 50 MB for 1 month
      expect(calculateRetentionCost(50 * 1024 * 1024, 1)).toBe(200);
    });
  });

  // PRICE-01: Calculate cost for 1 GB for 1 month (updated to reflect minimum)
  describe('PRICE-01: 1 GB × 1 month calculation', () => {
    it('should calculate cost for 1 GB for 1 month', () => {
      const oneGB = 1024 * 1024 * 1024;
      const costCents = calculateRetentionCost(oneGB, 1);
      
      // Expected: 1 GB × 1 month × $0.03 = $0.03 = 3 cents
      // But minimum is $2.00 = 200 cents
      expect(costCents).toBe(200);
    });

    it('should calculate cost for large storage that exceeds minimum', () => {
      // 100 GB × 1 month = $3.00 (exceeds $2 minimum)
      const hundredGB = 100 * 1024 * 1024 * 1024;
      const costCents = calculateRetentionCost(hundredGB, 1);
      
      // Expected: 100 GB × 1 month × $0.03 = $3.00 = 300 cents
      expect(costCents).toBe(300);
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
      const result = checkBalanceSufficient(500, 1024, 1);
      
      // 1KB for 1 month costs $2.00 (200 cents)
      // Balance of 500 cents is sufficient
      expect(result.sufficient).toBe(true);
      expect(result.required).toBe(200);
      expect(result.shortfall).toBe(0);
    });

    it('should detect insufficient balance', () => {
      const result = checkBalanceSufficient(100, 1024, 1);
      
      // 1KB for 1 month costs $2.00 (200 cents)
      // Balance of 100 cents is insufficient
      expect(result.sufficient).toBe(false);
      expect(result.required).toBe(200);
      expect(result.shortfall).toBe(100);
    });
  });
});
