import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserProfile } from './user-profile.js';
import { identifiedDownloadPriceUc } from '../utils/cost-policy.js';
import { flushDownloadOutbox } from './download-outbox.js';

export function profileFixture(overrides = {}, env = {}) {
  const profile = { user_id: 'user', balance_cents: 10, total_spent_cents: 0,
    api_keys: [{ key_id: 'key', expires_at: '2099-01-01', key_hash: 'hash', scopes: ['downloads:spend'] }],
    oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 1, spending_used: 0, spending_reset: '2099-01-01' }], ...overrides };
  const values = new Map([['profile', structuredClone(profile)]]);
  const state = { storage: {
    get: async key => structuredClone(values.get(key)),
    put: async (key, value) => {
      for (const [id, data] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) values.set(id, structuredClone(data));
    },
    list: async ({ prefix, end, limit } = {}) => new Map([...values].sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => (!prefix || key.startsWith(prefix)) && (!end || key < end)).slice(0, limit)),
    delete: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key); },
    transaction: async operation => {
      const before = structuredClone(values);
      try { return await operation(state.storage); }
      catch (error) { values.clear(); for (const [key, value] of before) values.set(key, value); throw error; }
    },
    setAlarm: vi.fn(async () => {})
  } };
  const user = new UserProfile(state, env);
  const call = (path, data, method = data === undefined ? 'GET' : 'POST') => user.fetch(new Request(`https://internal/download/${path}`, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }));
  const events = () => [...values].filter(([key]) => key.startsWith('download-outbox:')).map(([, event]) => structuredClone(event))
    .concat(structuredClone(values.get('profile').download_outbox || [])).sort((a, b) => a.sequence - b.sequence);
  return { user, call, state, values, events, read: () => structuredClone(values.get('profile')) };
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
    expect(f.events()[0].transaction.type).toBe('download_spend');
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
    expect(f.events().some(e => e.transaction?.type === 'download_refund')).toBe(true);
  });
  it('applies a grant spending limit (migrated from dollars) alongside other spending and download caps', async () => {
    const f = profileFixture({ oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 0.01, spending_used: 0.009, spending_reset: '2099-01-01' }] });
    await enabled(f);
    await f.call('key-budget', { kind: 'oauth', key_id: 'grant', caps: caps() }, 'PUT');
    const grant = { u: 'user', k: 'grant', kind: 'oauth', app_id: 'app' };
    const result = await (await lease(f, { identity: grant, requests: 250 })).json();
    expect(result.lease_uc).toBe(100000);
    expect((await (await lease(f, { identity: grant })).json()).funded).toBe(false);
    expect(f.read().oauth_grants[0].spend_used_cents).toBeCloseTo(1);
    expect(f.read().oauth_grants[0].caveats.monthly_spend_limit_cents).toBe(1);
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
    await f.user.alarm(); expect(f.events().length).toBeGreaterThan(0);
    failRevenue = false; await f.user.alarm();
    expect(transactions.size).toBe(1); expect(revenues.size).toBe(1);
    expect(f.read().balance_cents).toBe(before); expect(f.events()).toEqual([]);
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

it('does not postpone pending accounting delivery during continuous download traffic', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const f = profileFixture();
  let alarmAt = null;
  f.state.storage.getAlarm = async () => alarmAt;
  f.state.storage.setAlarm.mockImplementation(async when => { alarmAt = when; });
  await enabled(f);
  await lease(f);
  const deliveryAt = alarmAt;
  expect(deliveryAt).toBe(Date.now() + 1000);
  vi.advanceTimersByTime(500);
  await f.call('check', { identity, price_uc: 400, requests: 1, request_id: 'confirmation' });
  await lease(f);
  expect(alarmAt).toBe(deliveryAt);
});

it.each(['revoked', 'hard_stop', 'invalid_request'])('preserves an unused-credit return when renewal is rejected (%s)', async failure => {
  const env = {}, f = profileFixture({}, env); await enabled(f);
  const first = await (await lease(f)).json();
  if (failure === 'revoked') {
    const profile = f.read(); profile.api_keys[0].revoked_at = new Date().toISOString();
    f.values.set('profile', profile);
  } else if (failure === 'hard_stop') env.COST_SAFETY_HARD_STOP = 'true';
  const renewal = await lease(f, { lease_id: first.lease_id, unused_uc: 99600,
    ...(failure === 'invalid_request' ? { requests: 0 } : {}) });
  expect(renewal.status).toBe(failure === 'revoked' ? 401 : failure === 'hard_stop' ? 503 : 400);
  expect(f.read().download_budget.spend.account.day_uc).toBe(400);
  expect(f.read().download_budget.float_uc).toBe(999600);
  expect(f.events().filter(e => e.revenue_cents < 0)).toHaveLength(1);
  await f.call('return', { identity, lease_id: first.lease_id, unused_uc: 99600 });
  expect(f.read().download_budget.float_uc).toBe(999600);
});

it('does not charge again when a returned lease allocation is retried', async () => {
  const f = profileFixture(); await enabled(f);
  const first = await (await lease(f, { request_id: 'retry-after-return' })).json();
  await f.call('return', { identity, lease_id: first.lease_id, unused_uc: 99600 });
  const before = f.read();
  const retry = await (await lease(f, { request_id: first.lease_id })).json();
  expect(retry.funded).toBe(false);
  expect(retry.reason).toBe('returned');
  expect(f.read().download_budget.spend).toEqual(before.download_budget.spend);
  expect(f.read().download_budget.float_uc).toBe(before.download_budget.float_uc);
  expect(f.read().download_outbox).toEqual(before.download_outbox);
});

it('rejects reuse of an allocation ID with a different request price or size', async () => {
  const f = profileFixture(); await enabled(f);
  await lease(f, { request_id: 'fixed-request' });
  const before = f.read().download_budget.spend;
  expect((await lease(f, { request_id: 'fixed-request', price_uc: 800 })).status).toBe(400);
  expect((await lease(f, { request_id: 'fixed-request', requests: 1 })).status).toBe(400);
  expect(f.read().download_budget.spend).toEqual(before);
});

it.each(['revoked', 'abandoned', 'expired'])('reclaims browser session capacity from %s sessions', async reason => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const f = profileFixture();
  const sessions = [];
  for (let i = 0; i < 100; i++) sessions.push((await (await f.call('sessions', {})).json()).sid);
  expect((await f.call('sessions', {})).status).toBe(400);
  if (reason === 'revoked') await f.call('sessions', { sid: sessions[0] }, 'DELETE');
  else vi.advanceTimersByTime(reason === 'abandoned' ? 60000 : 30 * 86400000);
  const created = await f.call('sessions', {});
  expect(created.status).toBe(200);
  expect((await created.json()).sid).toBeTruthy();
  expect(Object.keys(f.read().download_budget.sessions).length).toBeLessThanOrEqual(100);
  expect(f.read().download_budget.sessions[sessions[0]]).toBeUndefined();
});

it('reads legacy profile leases and migrates their returned receipts without losing credit', async () => {
  const f = profileFixture(); await enabled(f);
  const first = await (await lease(f, { request_id: 'legacy' })).json();
  const profile = f.read();
  const receipt = f.values.get('download-lease:legacy');
  delete receipt.price_uc; delete receipt.requests;
  profile.download_budget.leases.legacy = receipt;
  f.values.set('profile', profile);
  f.values.delete('download-lease:legacy');
  expect((await (await lease(f, { request_id: 'legacy' })).json()).lease_uc).toBe(first.lease_uc);
  await f.call('return', { identity, lease_id: 'legacy', unused_uc: first.lease_uc - 400 });
  expect(f.read().download_budget.leases).toEqual({});
  expect(f.values.get('download-lease:legacy').returned_at).toBeTruthy();
  expect(f.read().download_budget.spend.account.day_uc).toBe(400);
  expect((await (await lease(f, { request_id: 'legacy' })).json()).reason).toBe('returned');
});

it('commits the balance and retry receipt together when an allocation write fails', async () => {
  const f = profileFixture(); await enabled(f);
  const before = f.read();
  const put = f.state.storage.put;
  f.state.storage.put = async (...args) => {
    if (typeof args[0] === 'object' && args[0]['download-lease:atomic']) throw new Error('Storage unavailable');
    return put(...args);
  };
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await lease(f, { request_id: 'atomic' })).status).toBe(500); }
  finally { errorLog.mockRestore(); }
  expect(f.read()).toEqual(before);
  expect(f.values.has('download-lease:atomic')).toBe(false);
  f.state.storage.put = put;
  await lease(f, { request_id: 'atomic' });
  await lease(f, { request_id: 'atomic' });
  expect(f.read().download_budget.spend.account.day_uc).toBe(100000);
  expect(f.read().balance_cents).toBe(9);
});

it('does not accumulate completed leases in the profile balance record', async () => {
  const f = profileFixture(); await enabled(f);
  for (let i = 0; i < 100; i++) {
    const next = await (await lease(f)).json();
    await f.call('return', { identity, lease_id: next.lease_id, unused_uc: next.lease_uc - 400 });
  }
  expect(f.read().download_budget.leases).toEqual({});
  expect([...f.values.keys()].filter(key => key.startsWith('download-lease:'))).toHaveLength(100);
  expect(f.read().download_budget.spend.account.day_uc).toBe(40000);
});

it('keeps active browser sessions when pruning abandoned handshakes', async () => {
  vi.useFakeTimers();
  const f = profileFixture();
  const { sid } = await (await f.call('sessions', {})).json();
  await f.call('session/activate', { sid });
  vi.advanceTimersByTime(60000);
  await f.call('sessions', {});
  expect(f.read().download_budget.sessions[sid].active).toBe(true);
});

it('schedules receipt cleanup through the accounting alarm without refunding spent leases', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const binding = { idFromName: id => id, get: () => ({ fetch: async () => Response.json({}) }) };
  const f = profileFixture({}, { PAYMENT_RECORDS: binding, PLATFORM_STATS: binding }); await enabled(f);
  const first = await (await lease(f)).json();
  const spent = f.read().download_budget.spend.account.month_uc;
  await f.user.alarm();
  expect(f.events()).toEqual([]);
  expect(f.state.storage.setAlarm).toHaveBeenLastCalledWith(first.expires_at + 86400000);
  vi.setSystemTime(new Date(first.expires_at + 86400000));
  await f.user.alarm();
  expect(f.values.has(`download-lease:${first.lease_id}`)).toBe(false);
  expect(f.read().download_budget.spend.account.month_uc).toBe(spent);
  expect(f.read().balance_cents).toBe(9);
  expect(f.state.storage.setAlarm).toHaveBeenLastCalledWith(Date.parse('2026-11-01T00:00:00Z'));
});

it('retries a failed return write without losing or duplicating the refund', async () => {
  const f = profileFixture(); await enabled(f);
  const first = await (await lease(f)).json();
  const before = f.read(), put = f.state.storage.put;
  f.state.storage.put = async (...args) => {
    if (typeof args[0] === 'object' && args[0][`download-lease:${first.lease_id}`]?.returned_at) throw new Error('Return write failed');
    return put(...args);
  };
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  const returned = { identity, lease_id: first.lease_id, unused_uc: first.lease_uc - 400 };
  try { expect((await f.call('return', returned)).status).toBe(500); }
  finally { errorLog.mockRestore(); }
  expect(f.read()).toEqual(before);
  expect(f.values.get(`download-lease:${first.lease_id}`).returned_at).toBeUndefined();
  f.state.storage.put = put;
  await f.call('return', returned);
  await f.call('return', returned);
  expect(f.read().download_budget.spend.account.day_uc).toBe(400);
  expect(f.read().download_budget.float_uc).toBe(999600);
  expect(f.events().filter(e => e.revenue_cents < 0)).toHaveLength(1);
});

it('keeps a large undelivered accounting backlog outside the profile', async () => {
  const f = profileFixture(); await enabled(f);
  for (let i = 0; i < 1500; i++) await lease(f, { requests: 1 });
  expect(f.events()).toHaveLength(1501);
  expect(f.read().download_outbox).toEqual([]);
  expect(f.read().download_outbox_pending).toBe(1501);
  expect(JSON.stringify(f.read()).length).toBeLessThan(5000);
  expect(f.read().balance_cents).toBe(9);
  expect(f.read().download_budget.spend.account.month_uc).toBe(600000);
});

it('drains accounting in ordered bounded batches and reschedules while work remains', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const delivered = [];
  const binding = { idFromName: id => id, get: () => ({ fetch: async request => {
    const event = await request.json(); if (event.sequence) delivered.push(event.sequence); return Response.json({});
  } }) };
  const f = profileFixture({}, { PAYMENT_RECORDS: binding, PLATFORM_STATS: binding }); await enabled(f);
  for (let i = 0; i < 40; i++) await lease(f, { requests: 1 });
  const before = f.read().balance_cents;
  await f.user.alarm();
  expect(f.events()).toHaveLength(25);
  expect(f.state.storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + 1000);
  // Account requests can run between batches, without replaying the debit.
  expect((await f.call('budget')).status).toBe(200);
  await f.user.alarm(); await f.user.alarm();
  expect(f.events()).toEqual([]);
  expect(delivered).toEqual(Array.from({ length: 40 }, (_, i) => i + 2));
  expect(f.read().balance_cents).toBe(before);
  expect(f.read().download_outbox_pending).toBe(0);
});

it('migrates a legacy outbox larger than the atomic put limit without reordering events', async () => {
  const delivered = [];
  const events = Array.from({ length: 300 }, (_, i) => ({ id: `event-${i}`, user_id: 'user', sequence: i + 1, period: '2026-10', revenue_cents: 0.0004 }));
  const binding = { idFromName: id => id, get: () => ({ fetch: async request => {
    delivered.push((await request.json()).sequence); return Response.json({});
  } }) };
  const f = profileFixture({ download_event_sequence: 300, download_outbox: events }, { PLATFORM_STATS: binding });
  const put = f.state.storage.put;
  f.state.storage.put = async (key, value) => {
    if (typeof key === 'object') expect(Object.keys(key).length).toBeLessThanOrEqual(128);
    return put(key, value);
  };
  for (let i = 0; i < 30 && f.events().length; i++) await flushDownloadOutbox(f.user);
  expect(delivered).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
  expect(f.events()).toEqual([]);
  expect(f.read().download_outbox_pending).toBe(0);
});

it('replays unacknowledged deliveries after an acknowledgement transaction fails', async () => {
  const calls = [], unique = new Set();
  const binding = { idFromName: id => id, get: () => ({ fetch: async request => {
    const event = await request.json(); const id = event.transaction_id || event.id;
    calls.push(id); unique.add(id); return Response.json({});
  } }) };
  const f = profileFixture({}, { PAYMENT_RECORDS: binding, PLATFORM_STATS: binding }); await enabled(f); await lease(f);
  const before = f.read(), put = f.state.storage.put;
  f.state.storage.put = async (key, value) => {
    if (key === 'profile' && value.download_outbox_pending === 0) throw new Error('Ack failed');
    return put(key, value);
  };
  await expect(flushDownloadOutbox(f.user)).rejects.toThrow('Ack failed');
  expect(f.events()).toHaveLength(2);
  expect(f.read()).toEqual(before);
  f.state.storage.put = put;
  expect(await flushDownloadOutbox(f.user)).toBe(false);
  expect(calls).toHaveLength(4); expect(unique.size).toBe(2);
  expect(f.read().balance_cents).toBe(before.balance_cents);
});

it('yields accounting after a slow delivery so account requests can proceed', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const binding = { idFromName: id => id, get: () => ({ fetch: async () => {
    vi.advanceTimersByTime(1100); return Response.json({});
  } }) };
  const f = profileFixture({}, { PAYMENT_RECORDS: binding, PLATFORM_STATS: binding }); await enabled(f); await lease(f);
  expect(await flushDownloadOutbox(f.user)).toBe(true);
  expect(f.events()).toHaveLength(1);
  expect((await f.call('budget')).status).toBe(200);
  expect(await flushDownloadOutbox(f.user)).toBe(false);
});

it('acknowledges a delivered prefix before retrying a failed accounting sink', async () => {
  const attempts = [];
  let failing = true;
  const binding = { idFromName: id => id, get: () => ({ fetch: async request => {
    const event = await request.json(); attempts.push(event.sequence);
    return event.sequence === 3 && failing ? new Response('', { status: 503 }) : Response.json({});
  } }) };
  const events = Array.from({ length: 4 }, (_, i) => ({ id: `event-${i}`, user_id: 'user', sequence: i + 1, period: '2026-10', revenue_cents: 0.0004 }));
  const f = profileFixture({ download_event_sequence: 4, download_outbox: events }, { PLATFORM_STATS: binding });
  await expect(flushDownloadOutbox(f.user)).rejects.toThrow('accounting unavailable');
  expect(f.events().map(e => e.sequence)).toEqual([3, 4]);
  expect(f.read().download_outbox_pending).toBe(2);
  failing = false;
  expect(await flushDownloadOutbox(f.user)).toBe(false);
  expect(attempts).toEqual([1, 2, 3, 3, 4]);
});

it('prunes expired receipts even while accounting delivery is unavailable', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const binding = { idFromName: id => id, get: () => ({ fetch: async () => new Response('', { status: 503 }) }) };
  const f = profileFixture({}, { PAYMENT_RECORDS: binding, PLATFORM_STATS: binding }); await enabled(f);
  const first = await (await lease(f)).json();
  vi.setSystemTime(new Date(first.expires_at + 86400000));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { await f.user.alarm(); } finally { log.mockRestore(); }
  expect(f.values.has(`download-lease:${first.lease_id}`)).toBe(false);
  expect(f.events()).toHaveLength(2);
  expect(f.state.storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + 60000);
});

it('continues accounting batches even when receipt cleanup fails', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const binding = { idFromName: id => id, get: () => ({ fetch: async () => Response.json({}) }) };
  const f = profileFixture({}, { PAYMENT_RECORDS: binding, PLATFORM_STATS: binding }); await enabled(f);
  for (let i = 0; i < 40; i++) await lease(f, { requests: 1 });
  const list = f.state.storage.list;
  f.state.storage.list = options => {
    if (options.prefix === 'download-lease-expiry:') throw new Error('Cleanup unavailable');
    return list(options);
  };
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { await f.user.alarm(); } finally { log.mockRestore(); }
  expect(f.events()).toHaveLength(25);
  expect(f.state.storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + 1000);
});
