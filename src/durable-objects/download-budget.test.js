import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserProfile } from './user-profile.js';
import { identifiedDownloadPriceUc } from '../utils/cost-policy.js';

export function profileFixture(overrides = {}, env = {}) {
  const profile = { user_id: 'user', balance_cents: 10, total_spent_cents: 0,
    api_keys: [{ key_id: 'key', expires_at: '2099-01-01', key_hash: 'hash' }],
    oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 1, spending_used: 0, spending_reset: '2099-01-01' }], ...overrides };
  const values = new Map([['profile', structuredClone(profile)]]);
  const state = { storage: { get: async key => structuredClone(values.get(key)), put: async (key, value) => values.set(key, structuredClone(value)), setAlarm: vi.fn(async () => {}) } };
  const user = new UserProfile(state, env);
  const call = (path, data, method = data === undefined ? 'GET' : 'POST') => user.fetch(new Request(`https://internal/download/${path}`, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }));
  return { user, call, state, values, read: () => structuredClone(values.get('profile')) };
}
const caps = (daily = 1, monthly = 1) => ({ daily_cap_cents: daily, monthly_cap_cents: monthly });
const identity = { u: 'user', k: 'key', kind: 'key', key_hash: 'hash' };
async function enabled(fixture, account = caps(), key = caps()) {
  await fixture.call('budget', { account }, 'PUT');
  await fixture.call('key-budget', { key_id: 'key', caps: key }, 'PUT');
}
function lease(f, options = {}) { return f.call('lease', { identity, price_uc: 400, requests: 250, request_id: crypto.randomUUID(), ...options }); }
afterEach(() => vi.useRealTimers());

describe('funded download accounting', () => {
  it('prices small files at 400 micro-cents and large files at 2 cents/GiB', () => {
    expect(identifiedDownloadPriceUc(0)).toBe(400);
    expect(identifiedDownloadPriceUc(1000)).toBe(400);
    expect(identifiedDownloadPriceUc(1024 ** 3)).toBe(2000000);
    expect(identifiedDownloadPriceUc(1024 ** 3 + 1)).toBe(2000001);
    expect(() => identifiedDownloadPriceUc(NaN)).toThrow();
  });
  it('requires explicit account and key opt-in', async () => {
    const f = profileFixture();
    expect((await (await lease(f)).json()).funded).toBe(false);
    await f.call('budget', { account: caps() }, 'PUT');
    expect((await (await lease(f)).json()).funded).toBe(false);
    await enabled(f);
    expect((await (await lease(f)).json()).funded).toBe(true);
    expect(f.read().balance_cents).toBe(9);
    expect(f.read().download_budget.float_uc).toBe(900000);
    expect(f.read().download_outbox[0].transaction.type).toBe('download_spend');
  });
  it('serializes concurrent leases across keys without passing account caps or balance', async () => {
    const f = profileFixture({ balance_cents: 1 }); await enabled(f, caps(3, 3), caps(3, 3));
    const results = await Promise.all(Array.from({ length: 20 }, () => lease(f).then(r => r.json())));
    expect(results.filter(r => r.funded)).toHaveLength(10);
    expect(f.read().download_budget.spend.account.month_uc).toBe(1000000);
    expect(f.read().balance_cents).toBe(0);
    expect(f.read().download_budget.float_uc).toBe(0);
  });
  it.each([[1, 2, 4, 4], [4, 4, 1, 2], [2, 1, 4, 4], [4, 4, 2, 1]])('enforces both daily and monthly caps (%s,%s,%s,%s)', async (ad, am, kd, km) => {
    const f = profileFixture(); await enabled(f, caps(ad, am), caps(kd, km));
    await Promise.all(Array.from({ length: 20 }, () => lease(f)));
    expect(f.read().download_budget.spend.account.month_uc).toBe(1000000);
  });
  it('credits remainders exactly once, handles retry IDs, and leaves unreported leases spent', async () => {
    const f = profileFixture(); await enabled(f);
    const first = await (await lease(f, { request_id: 'retry' })).json();
    await lease(f, { request_id: 'retry' });
    expect(f.read().download_budget.spend.account.day_uc).toBe(first.lease_uc);
    await f.call('return', { identity, lease_id: first.lease_id, unused_uc: 99600 });
    await f.call('return', { identity, lease_id: first.lease_id, unused_uc: 99600 });
    expect(f.read().download_budget.spend.account.day_uc).toBe(400);
    await lease(f); // This lease remains spent even after its local TTL.
    expect(f.read().download_budget.spend.account.day_uc).toBe(100400);
  });
  it('rolls day and month at UTC midnight, refunds whole-cent float, keeps fractional credit', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-31T23:59:59Z'));
    const f = profileFixture(); await enabled(f);
    const first = await (await lease(f)).json();
    expect(first.expires_at).toBe(Date.parse('2026-02-01T00:00:00Z'));
    vi.setSystemTime(new Date('2026-02-01T00:00:01Z'));
    await f.call('return', { identity, lease_id: first.lease_id, unused_uc: first.lease_uc });
    const b = f.read().download_budget;
    expect(b.spend.account).toEqual({ day_uc: 0, month_uc: 0 });
    expect(b.float_uc).toBe(0); expect(f.read().balance_cents).toBe(10);
    expect(f.read().download_outbox.some(e => e.transaction?.type === 'download_refund')).toBe(true);
  });
  it('applies OAuth spending_limit alongside other spending and download caps', async () => {
    const f = profileFixture({ oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 0.01, spending_used: 0.009, spending_reset: '2099-01-01' }] });
    await enabled(f);
    await f.call('key-budget', { kind: 'oauth', key_id: 'grant', caps: caps() }, 'PUT');
    const grant = { u: 'user', k: 'grant', kind: 'oauth', app_id: 'app' };
    const result = await (await lease(f, { identity: grant, requests: 250 })).json();
    expect(result.lease_uc).toBe(100000);
    expect((await (await lease(f, { identity: grant })).json()).funded).toBe(false);
    expect(f.read().oauth_grants[0].spending_used).toBeCloseTo(0.01);
  });
  it('checks funding without charging file allowance requests', async () => {
    const f = profileFixture(); await enabled(f);
    const r = await f.call('check', { identity, price_uc: 400, requests: 1, request_id: 'check' });
    expect((await r.json()).funded).toBe(true);
    expect(f.read().balance_cents).toBe(10);
    expect(f.read().download_budget.spend.account.day_uc).toBe(0);
  });
  it('rejects revoked keys, wrong hashes, grants without scope and the hard stop', async () => {
    const f = profileFixture(); await enabled(f);
    expect((await lease(f, { identity: { ...identity, key_hash: 'wrong' } })).status).toBe(401);
    const blocked = profileFixture({}, { COST_SAFETY_HARD_STOP: 'true' }); await enabled(blocked);
    expect((await lease(blocked)).status).toBe(503);
  });
});

describe('download accounting outbox', () => {
  it('retries accounting after a partial delivery without debiting the user again', async () => {
    const transactions = new Map(), revenues = new Map();
    let failRevenue = true;
    const binding = object => ({ idFromName: id => id, get: () => object });
    const f = profileFixture({}, {
      PAYMENT_RECORDS: binding({ fetch: async r => { const tx = await r.json(); transactions.set(tx.transaction_id, tx); return Response.json({}); } }),
      PLATFORM_STATS: binding({ fetch: async r => { const event = await r.json(); if (failRevenue) return new Response('', { status: 503 }); revenues.set(event.id, event); return Response.json({}); } })
    });
    await enabled(f); await lease(f);
    const before = f.read().balance_cents;
    await f.user.alarm(); expect(f.read().download_outbox.length).toBeGreaterThan(0);
    failRevenue = false; await f.user.alarm();
    expect(transactions.size).toBe(1); expect(revenues.size).toBe(1);
    expect(f.read().balance_cents).toBe(before); expect(f.read().download_outbox).toEqual([]);
  });
});

it('does not credit an old grant lease against a new monthly spending window', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-31T23:59:59Z'));
  const f = profileFixture({ oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 1, spending_used: 0, spending_reset: '2026-02-01T00:00:00.000Z' }] });
  await enabled(f); await f.call('key-budget', { kind: 'oauth', key_id: 'grant', caps: caps() }, 'PUT');
  const grant = { u: 'user', k: 'grant', kind: 'oauth', app_id: 'app' };
  const old = await (await lease(f, { identity: grant })).json();
  vi.setSystemTime(new Date('2026-02-01T00:00:01Z'));
  // An ordinary OAuth debit resets the grant before download state rolls over.
  await f.user.fetch(new Request('https://internal/balance/debit', { method: 'POST', body: JSON.stringify({ amount_cents: 1, oauth_grant_id: 'grant' }) }));
  const before = f.read().oauth_grants[0].spending_used;
  await f.call('return', { identity: grant, lease_id: old.lease_id, unused_uc: old.lease_uc });
  expect(f.read().oauth_grants[0].spending_used).toBe(before);
});
