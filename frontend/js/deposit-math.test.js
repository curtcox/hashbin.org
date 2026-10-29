import { describe, expect, it } from 'vitest';
import { depositBreakdown, formatCents } from './deposit-math.js';
import { grossUp } from '../../src/utils/cost-policy.js';

describe('depositBreakdown', () => {
  it('matches the worked examples on /docs/deposits.html', () => {
    expect(depositBreakdown(100)).toEqual({ creditCents: 100, totalChargeCents: 134, cardCostCents: 34, stripeFeeCents: 34, roundingCents: 0 });
    expect(depositBreakdown(1000)).toEqual({ creditCents: 1000, totalChargeCents: 1061, cardCostCents: 61, stripeFeeCents: 61, roundingCents: 0 });
  });

  it('charges what the server charges, and always covers Stripe within a cent', () => {
    for (let credit = 100; credit <= 100000; credit += 7) {
      const b = depositBreakdown(credit);
      expect(b.totalChargeCents).toBe(grossUp(credit));
      expect(b.totalChargeCents - b.stripeFeeCents).toBeGreaterThanOrEqual(credit);
      expect(b.roundingCents).toBeGreaterThanOrEqual(0);
      expect(b.roundingCents).toBeLessThanOrEqual(1);
    }
  });

  it('formats cents as dollars', () => {
    expect(formatCents(1061)).toBe('$10.61');
  });
});
