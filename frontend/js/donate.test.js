import { describe, expect, it } from 'vitest';
import { describeMonths, donationMonths } from './donate.js';

describe('donation preview', () => {
  const oneGB = 1024 * 1024 * 1024;

  it('matches the server rule: whole months, capped, none for inline content', () => {
    expect(donationMonths(100, oneGB)).toBe(33);
    expect(donationMonths(100, 50 * oneGB)).toBe(0);
    expect(donationMonths(100, 65)).toBe(1200);
    expect(donationMonths(500, 64)).toBe(0);
  });

  it('describes durations', () => {
    expect(describeMonths(33)).toBe('2 years 9 months');
    expect(describeMonths(12)).toBe('1 year');
    expect(describeMonths(1)).toBe('1 month');
  });
});
