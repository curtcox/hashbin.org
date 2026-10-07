import { describe, expect, it } from 'vitest';
import { checkClerk, checkStripe } from './index.js';

describe('checkStripe', () => {
  const prod = { ENVIRONMENT: 'production', STRIPE_WEBHOOK_SECRET: 'whsec_x' };

  it('is operational with live keys in production', async () => {
    const result = await checkStripe({ ...prod, STRIPE_SECRET_KEY: 'sk_live_abc' });
    expect(result.status).toBe('operational');
    expect(result.details.usingTestKeysInProduction).toBe(false);
  });

  it('is degraded with a test secret key in production', async () => {
    const result = await checkStripe({ ...prod, STRIPE_SECRET_KEY: 'sk_test_abc' });
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('Stripe is using test keys in production');
    expect(result.details.usingTestKeysInProduction).toBe(true);
  });

  it('is degraded with a restricted test key in production', async () => {
    const result = await checkStripe({ ...prod, STRIPE_SECRET_KEY: 'rk_test_abc' });
    expect(result.status).toBe('degraded');
  });

  it('allows test keys outside production', async () => {
    const result = await checkStripe({
      ENVIRONMENT: 'development',
      STRIPE_SECRET_KEY: 'sk_test_abc',
      STRIPE_WEBHOOK_SECRET: 'whsec_x'
    });
    expect(result.status).toBe('operational');
  });

  it('is down when nothing is configured', async () => {
    const result = await checkStripe({ ENVIRONMENT: 'production' });
    expect(result.status).toBe('down');
  });
});

describe('checkClerk', () => {
  it('is degraded with test keys in production', async () => {
    const result = await checkClerk({
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_test_abc',
      CLERK_PUBLISHABLE_KEY: 'pk_test_abc'
    });
    expect(result.status).toBe('degraded');
    expect(result.details.usingTestKeysInProduction).toBe(true);
  });

  it('is operational with live keys in production', async () => {
    const result = await checkClerk({
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_abc',
      CLERK_PUBLISHABLE_KEY: 'pk_live_abc'
    });
    expect(result.status).toBe('operational');
  });
});
