import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticate, checkout, refunds, constructEvent } = vi.hoisted(() => ({
  authenticate: vi.fn(), checkout: vi.fn(), refunds: vi.fn(), constructEvent: vi.fn()
}));
vi.mock('../auth/middleware.js', () => ({ authenticate }));
vi.mock('stripe', () => ({ default: vi.fn(function () {
  return { checkout: { sessions: { create: checkout } }, refunds: { create: refunds },
    webhooks: { constructEventAsync: constructEvent } };
}) }));
import { handleCreateDeposit, handleCreateDonation, handleStripeWebhook } from './payments.js';
import { handleExtendContent } from './content.js';

const binding = fetch => ({ idFromName: name => name, get: () => ({ fetch }) });
const post = body => new Request('https://hashbin.org/api/test', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  authenticate.mockResolvedValue({ authenticated: true, user: { userId: 'user', email: 'test@example.com' } });
  checkout.mockResolvedValue({ id: 'session', url: 'https://checkout.stripe.com/test' });
  refunds.mockResolvedValue({ id: 'refund' });
});
afterEach(() => vi.useRealTimers());

describe('cost safety at API boundaries', () => {
  it('caps deposits before creating a checkout and uses the gross-up on allowed deposits', async () => {
    const env = { USER_PROFILES: binding(async () => Response.json({ created_at: '2025-12-31T00:00:00Z' })) };
    expect((await handleCreateDeposit(post({ amount_cents: 2001 }), env)).status).toBe(400);
    expect(checkout).not.toHaveBeenCalled();
    expect((await handleCreateDeposit(post({ amount_cents: 2000 }), env)).status).toBe(200);
    const items = checkout.mock.calls[0][0].line_items.map(item => [item.price_data.product_data.name, item.price_data.unit_amount]);
    expect(items).toEqual([['HashBin balance credit', 2000], ['Card payment cost', 91]]);
    env.USER_PROFILES = binding(async () => Response.json({ created_at: '2025-01-01T00:00:00Z' }));
    expect((await handleCreateDeposit(post({ amount_cents: 5000 }), env)).status).toBe(200);
  });

  it('rejects an over-cap extension before debiting a balance', async () => {
    const profileFetch = vi.fn();
    const env = { USER_PROFILES: binding(profileFetch), CONTENT_METADATA: binding(async () => Response.json({
      size_bytes: 1000, expires_at: '2035-12-01T00:00:00Z'
    })) };
    expect((await handleExtendContent(post({ months_to_add: 2 }), env, 'file')).status).toBe(400);
    expect(profileFetch).not.toHaveBeenCalled();
  });

  it('fits donation checkout to the remaining outstanding retention cap', async () => {
    const env = { CONTENT_METADATA: binding(async () => Response.json({ exists: true,
      size_bytes: 65, expires_at: '2026-02-01T00:00:00Z' })) };
    const response = await handleCreateDonation(post({ amount_cents: 100 }), env, 'file');
    expect(response.status).toBe(200);
    expect((await response.json()).estimated_months_added).toBe(119);
    expect(checkout.mock.calls[0][0].metadata.retention_months).toBe('119');
  });

  it('refunds a donation rejected after checkout without recording it as earned revenue', async () => {
    constructEvent.mockResolvedValue({ id: 'evt', type: 'checkout.session.completed', data: { object: {
      id: 'session', payment_intent: 'pi_test', metadata: { type: 'donation', cid: 'file',
        donor_id: 'anonymous', amount_cents: '100', retention_months: '119' }
    } } });
    const stats = vi.fn();
    const env = { STRIPE_SECRET_KEY: 'test', STRIPE_WEBHOOK_SECRET: 'test',
      PAYMENT_RECORDS: binding(async () => Response.json({ exists: false })),
      PLATFORM_STATS: binding(stats),
      CONTENT_METADATA: binding(async req => new URL(req.url).pathname === '/content'
        ? Response.json({ size_bytes: 65, expires_at: '2036-01-01T00:00:00Z' })
        : Response.json({ error: 'retention_cap' }, { status: 400 })) };
    const request = new Request('https://hashbin.org/api/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': 'test' }, body: '{}' });
    expect((await handleStripeWebhook(request, env)).status).toBe(200);
    expect(refunds).toHaveBeenCalledWith({ payment_intent: 'pi_test' }, { idempotencyKey: 'retention-cap-session' });
    expect(stats).not.toHaveBeenCalled();
  });
});
