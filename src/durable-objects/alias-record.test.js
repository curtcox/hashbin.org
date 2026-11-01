import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { aliasFixture } from '../../test-utils/alias-fixture.js';
import { generate256tHash } from '../utils/hash256t.js';
import { closeAccountAliases } from '../services/alias-lifecycle.js';
import { moveAccount } from '../services/account-move.js';

let f, cid;
beforeEach(async () => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T00:00:00Z')); f = aliasFixture(); cid = await generate256tHash(new Uint8Array([1])); });
afterEach(() => vi.useRealTimers());
const claim = (data = {}, name = 'document') => f.global(name, 'claim', { cid, request_id: 'claim', ...data });
const record = () => f.env.ALIAS_RECORDS.get('alias:document');

it('reports an unclaimed name to anonymous and signed-in viewers', async () => {
  for (const user of [null, 'viewer']) {
    const response = await f.global('document', 'info', {}, user);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'free', is_owner: false, yearly_price_cents: 100 });
  }
});

it('serializes competing claims, renews/repoints, limits history and keeps owners private', async () => {
  const results = await Promise.all(['seller', 'other'].map(user => f.global('document', 'claim', { cid, request_id: user }, user)));
  expect(results.map(r => r.status)).toEqual([201, 409]);
  expect(await f.balance('seller')).toBe(9900);
  expect(await f.balance('other')).toBe(10000);
  expect((await f.global('document', 'renew', { years: 1 })).ok).toBe(true);
  expect(await f.balance('seller')).toBe(9800);
  expect((await f.global('document', 'value', { cid }, 'other')).status).toBe(403);
  const info = await (await f.global('document', 'info', {}, null)).json();
  expect(JSON.stringify(info)).not.toContain('seller');
  expect(info.history.map(h => h.type)).toEqual(['ownership', 'value']);
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(200);
});

it('recovers a lost debit reply without charging twice or losing accounting', async () => {
  const user = f.env.USER_PROFILES.get('seller');
  user.fetch.mockImplementationOnce(async request => user.object.fetch(request)); // purchase receipt read
  const actual = user.object.fetch.bind(user.object); let lost = false;
  user.fetch.mockImplementation(async request => {
    const response = await actual(request);
    if (!lost && new URL(request.url).pathname === '/balance/debit') { lost = true; throw new Error('lost reply'); }
    return response;
  });
  expect((await claim()).status).toBe(503);
  expect(await f.balance('seller')).toBe(9900);
  expect(await record().state.storage.get('pending')).toBeTruthy();
  expect((await claim()).status).toBe(201);
  expect(await f.balance('seller')).toBe(9900);
  expect(await record().state.storage.get('pending')).toBeUndefined();
  expect(await f.env.PLATFORM_STATS.get('global').state.storage.get('alias_revenue_cents')).toBe(100);
  expect(await f.env.PAYMENT_RECORDS.get('seller').state.storage.get('transactions')).toHaveLength(1);
});

it('abandons an undebited intent and rejects a delayed debit after recovery cancels it', async () => {
  const seller = f.env.USER_PROFILES.get('seller'); let unavailable = true;
  seller.fetch.mockImplementation(request => {
    if (unavailable && new URL(request.url).pathname === '/balance/debit') throw new Error('not delivered');
    return seller.object.fetch(request);
  });
  expect((await claim()).status).toBe(503);
  const pending = await record().state.storage.get('pending');
  unavailable = false;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await record().object.alarm(); log.mockRestore();
  expect(await f.balance('seller')).toBe(10000);
  const late = await seller.fetch(new Request('https://internal/balance/debit', { method: 'POST', body: JSON.stringify({
    amount_cents: 100, request_id: pending.money_id, request_created_at: pending.created_at, required_scope: 'aliases:purchase'
  }) }));
  expect(late.status).toBe(409);
  expect((await claim({ request_id: 'new-attempt' })).status).toBe(201);
  expect(await f.balance('seller')).toBe(9900);
});

it('refuses stale buy prices and self-buying, transfers the term, and credits net sale proceeds once', async () => {
  await claim();
  await f.global('document', 'listing', { price_cents: 1000 });
  expect((await f.global('document', 'buy', { price_cents: 999 }, 'buyer')).status).toBe(409);
  expect((await f.global('document', 'buy', { price_cents: 1000 })).status).toBe(400);
  const buyer = { price_cents: 1000, request_id: 'buy' };
  expect((await f.global('document', 'buy', buyer, 'buyer')).ok).toBe(true);
  expect((await f.global('document', 'buy', buyer, 'buyer')).ok).toBe(true);
  expect(await f.balance('buyer')).toBe(9000);
  expect(await f.balance('seller')).toBe(10800);
  expect((await record().state.storage.get('alias')).owner_id).toBe('buyer');
  expect((await record().state.storage.get('alias')).paid_through).toBe('2027-11-01T00:00:00.000Z');
  expect(await f.env.PLATFORM_STATS.get('global').state.storage.get('alias_revenue_cents')).toBe(200);
});

it('holds offers, accepts without a second debit and returns every other hold', async () => {
  await claim();
  const first = await (await f.global('document', 'offer', { amount_cents: 500 }, 'buyer')).json();
  await f.global('document', 'offer', { amount_cents: 600 }, 'other');
  expect(await f.balance('buyer')).toBe(9500);
  expect((await f.global('document', 'offer', { amount_cents: 700 }, 'buyer')).status).toBe(409);
  const accepted = await f.global('document', 'accept', { offer_id: first.offer_id });
  expect(accepted.ok).toBe(true);
  for (let i = 0; i < 4; i++) await record().object.alarm();
  expect(await f.balance('buyer')).toBe(9500);
  expect(await f.balance('other')).toBe(10000);
  expect(await f.balance('seller')).toBe(10350);
  expect((await record().state.storage.get('alias')).offers).toEqual([]);
});

it.each(['withdraw', 'decline', 'suspend', 'expiry'])('returns held funds on %s', async action => {
  await claim();
  const offer = await (await f.global('document', 'offer', { amount_cents: 100 }, 'buyer')).json();
  if (action === 'expiry') { vi.advanceTimersByTime(8 * 86400000); await record().object.alarm(); }
  else await f.global('document', action, { offer_id: offer.offer_id, ...(action === 'suspend' ? { admin: true } : {}) }, action === 'withdraw' ? 'buyer' : 'seller');
  expect(await f.balance('buyer')).toBe(10000);
});

it('renews automatically, stops at expiry, protects the grace period and deleteAll releases the name', async () => {
  await claim();
  await f.global('document', 'settings', { auto_renew: true });
  vi.setSystemTime(new Date('2027-10-25T00:00:00Z')); await record().object.alarm();
  expect(await f.balance('seller')).toBe(9800);
  await f.global('document', 'settings', { auto_renew: false });
  vi.setSystemTime(new Date('2028-11-01T00:00:00Z'));
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(410);
  expect((await f.global('document', 'claim', { cid }, 'buyer')).status).toBe(409);
  vi.advanceTimersByTime(30 * 86400000); await record().object.alarm();
  expect(record().state.storage.deleteAll).toHaveBeenCalled();
  expect((await f.global('document', 'claim', { cid }, 'buyer')).status).toBe(201);
});

it('reclaims and assigns reserved names only for admins; private aliases never make names public', async () => {
  expect((await claim({}, 'admin')).status).toBe(403);
  expect((await f.global('admin', 'assign', { owner_id: 'seller', cid, admin: true })).ok).toBe(true);
  await claim();
  expect((await f.global('document', 'suspend', { admin: true })).ok).toBe(true);
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(451);
  await f.global('document', 'restore', { admin: true });
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(200);
  await f.global('document', 'reclaim', { admin: true });
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(451);
});

it('releases owned names and outgoing holds before account deletion', async () => {
  await claim(); await f.global('document', 'offer', { amount_cents: 100 }, 'buyer');
  await f.global('another', 'claim', { cid }, 'other');
  await f.global('another', 'offer', { amount_cents: 200 }, 'seller');
  await closeAccountAliases(f.env, 'seller');
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(404);
  expect(await f.balance('buyer')).toBe(10000);
  expect(await f.balance('seller')).toBe(9900);
  expect((await f.global('another', 'offers-list', {}, 'other')).status).toBe(200);
  expect((await claim({ request_id: 'closed' })).status).toBe(403);
});

it('retries a lost seller-credit response after 31 days without crediting twice', async () => {
  await claim(); await f.global('document', 'listing', { price_cents: 1000 });
  const seller = f.env.USER_PROFILES.get('seller'); let lost = false;
  seller.fetch.mockImplementation(async request => {
    const response = await seller.object.fetch(request);
    if (!lost && new URL(request.url).pathname === '/balance/deposit') { lost = true; throw new Error('lost credit response'); }
    return response;
  });
  await f.global('document', 'buy', { price_cents: 1000 }, 'buyer');
  expect(await f.balance('seller')).toBe(10800);
  vi.advanceTimersByTime(32 * 86400000); await seller.object.alarm();
  await record().object.alarm();
  expect(await f.balance('seller')).toBe(10800);
  expect((await seller.state.storage.get('profile')).alias_receipts_pending).toBe(0);
});

it('moves ownership and private aliases, forwarding a hold returned during the account move', async () => {
  await claim(); await f.personal('seller', '/personal', { name: 'private-doc', cid });
  await f.env.USER_PROFILES.get('seller').object.alarm();
  await f.global('another', 'claim', { cid }, 'other');
  const offer = await (await f.global('another', 'offer', { amount_cents: 200 }, 'seller')).json();
  f.env.APPLICATION_REGISTRY = { idFromName: n => n, get: () => ({ fetch: async () => Response.json({ entries: {} }) }) };
  const target = f.env.USER_PROFILES.get('target'); let returned = false;
  target.fetch.mockImplementation(async request => {
    const response = await target.object.fetch(request);
    if (!returned && new URL(request.url).pathname === '/__restore') {
      returned = true;
      await f.global('another', 'decline', { offer_id: offer.offer_id }, 'other');
    }
    return response;
  });
  await moveAccount(f.env, { from: 'seller', to: 'target' });
  await f.env.ALIAS_RECORDS.get('alias:another').object.alarm();
  expect(await f.balance('target')).toBe(9888);
  expect(await f.balance('seller')).toBe(0);
  expect((await record().state.storage.get('alias')).owner_id).toBe('target');
  expect((await (await f.personal('target')).json()).personal.map(a => a.name)).toEqual(['private-doc']);
  expect((await target.state.storage.get('profile')).alias_receipts_pending).toBe(0);
});

it('alerts once on more than $50 of daily gross sales and keeps proceeds distinct from deposits', async () => {
  await claim(); await f.global('document', 'listing', { price_cents: 6000 });
  const sale = { price_cents: 6000, request_id: 'large-sale' };
  await f.global('document', 'buy', sale, 'buyer'); await f.global('document', 'buy', sale, 'buyer');
  const seller = f.env.USER_PROFILES.get('seller'); await seller.object.alarm();
  const profile = await seller.state.storage.get('profile');
  expect(profile.total_deposited_cents).toBe(10000);
  expect(profile.alias_sale_proceeds_cents).toBe(5400);
  expect((await f.env.ALERT_STORE.get('global').state.storage.list({ prefix: 'alert_' })).size).toBe(1);
});

it('registers named backups and restores held offers with the matching balance receipts', async () => {
  const register = vi.fn(async () => Response.json({ registered: true }));
  f.env.BACKUP_INDEX = { idFromName: name => name, get: () => ({ fetch: register }) };
  await claim();
  const offered = await (await f.global('document', 'offer', { amount_cents: 500, request_id: 'backup-offer' }, 'buyer')).json();
  expect(register.mock.calls.some(([request]) => {
    return new URL(request.url).pathname === '/register';
  })).toBe(true);
  const registrations = await Promise.all(register.mock.calls.map(([request]) => request.json()));
  expect(registrations).toContainEqual({ binding: 'ALIAS_RECORDS', name: 'alias:document' });

  const restored = aliasFixture();
  for (const binding of ['ALIAS_RECORDS', 'USER_PROFILES', 'PAYMENT_RECORDS', 'PLATFORM_STATS']) {
    for (const [name, object] of f.env[binding].objects) {
      const snapshot = await (await object.fetch(new Request('https://internal/__backup'))).json();
      const response = await restored.env[binding].get(name).fetch(new Request('https://internal/__restore', {
        method: 'POST', body: JSON.stringify({ entries: snapshot.entries, overwrite: true })
      }));
      expect(response.ok).toBe(true);
    }
  }
  const restoredRecord = restored.env.ALIAS_RECORDS.get('alias:document');
  expect(restoredRecord.state.storage.setAlarm).toHaveBeenCalled();
  expect(await restored.balance('buyer')).toBe(9500);
  expect((await restored.global('document', 'withdraw', { offer_id: offered.offer_id, request_id: 'return-backup-offer' }, 'buyer')).ok).toBe(true);
  await restoredRecord.object.alarm();
  expect(await restored.balance('buyer')).toBe(10000);
  expect(await restored.balance('seller')).toBe(9900);
  const transactions = await restored.env.PAYMENT_RECORDS.get('buyer').state.storage.list({ prefix: 'tx:' });
  expect([...transactions.values()].filter(tx => tx.type === 'alias_offer_return')).toHaveLength(1);
});

it('retries a failed backup registration on an alarm without needing another edit', async () => {
  let attempts = 0;
  f.env.BACKUP_INDEX = { idFromName: name => name, get: () => ({ fetch: async request => {
    const registration = await request.json();
    return registration.binding === 'ALIAS_RECORDS' && ++attempts === 1
      ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ registered: true });
  } }) };
  expect((await claim()).status).toBe(201);
  expect(attempts).toBe(1);
  expect(await record().state.storage.getAlarm()).toBe(Date.now() + 60000);
  vi.advanceTimersByTime(60000);
  await record().object.alarm();
  expect(attempts).toBe(2);
  expect(await record().state.storage.get('__backup_registered')).toBe(true);
  expect(await f.balance('seller')).toBe(9900);
});

it('stages a full offer book and 100 history entries without exceeding a storage value limit', async () => {
  const name = 'z'.repeat(63);
  await claim({}, name);
  const object = f.env.ALIAS_RECORDS.get(`alias:${name}`);
  const value = await object.state.storage.get('alias');
  value.history = Array.from({ length: 100 }, () => ({ type: 'value', cid: 'AAAAAABk' + 'a'.repeat(86), time: new Date().toISOString() }));
  await object.state.storage.put('alias', value);
  for (let i = 0; i < 100; i++) expect((await f.global(name, 'offer', { amount_cents: 100 }, `buyer-${i}`)).status).toBe(201);
  expect((await f.global(name, 'offer', { amount_cents: 100 }, 'over-limit')).status).toBe(409);
  const offer = (await object.state.storage.get('alias')).offers[0];
  expect((await f.global(name, 'accept', { offer_id: offer.id })).status).toBe(200);
  for (let i = 0; i < 15; i++) await object.object.alarm();
  expect((await object.state.storage.list({ prefix: 'outbox:' })).size).toBe(0);
  expect(await f.balance('buyer-99')).toBe(10000);
// This exercises 100 complete purchase sagas and their refund outboxes on shared CI runners.
}, 30000);
