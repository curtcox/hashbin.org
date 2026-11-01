import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { aliasFixture } from '../../test-utils/alias-fixture.js';
import { generate256tHash } from '../utils/hash256t.js';
import { COST_POLICY } from '../utils/cost-policy.js';

let f, cid, other;
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
  f = aliasFixture(); cid = await generate256tHash(new TextEncoder().encode('hello'));
  other = await generate256tHash(new TextEncoder().encode('world'));
});
afterEach(() => vi.useRealTimers());
const create = (data = {}) => f.personal('user', '/personal', { name: 'my-file', cid, request_id: 'create', ...data });

it('atomically charges once, stores outside the profile and retains an exact retry result', async () => {
  const responses = await Promise.all(Array.from({ length: 10 }, () => create()));
  expect(responses.every(r => r.ok)).toBe(true);
  expect(await f.balance('user')).toBe(9988);
  expect((await (await f.personal('user')).json()).personal).toHaveLength(1);
  const state = f.env.USER_PROFILES.get('user').state;
  expect((await state.storage.get('profile')).personal_aliases).toBeUndefined();
  expect((await create({ months: 2 })).status).toBe(409);
  await f.env.USER_PROFILES.get('user').object.alarm();
  const history = await f.env.PAYMENT_RECORDS.get('user').state.storage.get('transactions');
  expect(history).toHaveLength(1);
  const tx = await f.env.PAYMENT_RECORDS.get('user').state.storage.get(`tx:${history[0]}`);
  expect(tx).toMatchObject({ type: 'personal_alias', alias_names: ['my-file'], alias_months: 12, amount_cents: 12 });
  expect(await f.env.PLATFORM_STATS.get('global').state.storage.get('alias_revenue_cents')).toBe(12);
});

it('validates names, integer months, CIDs, balance, retention and reserved names', async () => {
  for (const data of [{ name: 'admin' }, { name: 'a..b' }, { months: 0 }, { months: 1.5 }, { months: 121 }, { cid: 'invalid' }]) expect((await create(data)).ok).toBe(false);
  expect(await f.balance('user')).toBe(10000);
  await create({ months: 120 });
  expect((await f.personal('user', '/personal/my-file/renew', { months: 1 })).status).toBe(400);
  expect((await f.personal('user', '/personal/my-file', { cid: other }, 'PUT')).ok).toBe(true);
});

it('enforces a durable account-wide daily counter, including deletes and setting changes', async () => {
  await create();
  const results = await Promise.all(Array.from({ length: COST_POLICY.aliasChangesPerDay }, () =>
    f.personal('user', '/personal/my-file', { cid: other }, 'PUT')));
  expect(results.filter(r => r.status === 429)).toHaveLength(1);
  expect(results.at(-1).headers.get('Retry-After')).toBe('43200');
  expect((await f.personal('user', '/personal/my-file', undefined, 'DELETE')).status).toBe(429);
  vi.advanceTimersByTime(86400000);
  expect((await f.personal('user', '/personal/my-file', undefined, 'DELETE')).ok).toBe(true);
  expect(await f.balance('user')).toBe(9988);
});

it('clamps calendar months, stops at expiry, permits grace renewal and deletes after grace', async () => {
  const first = await (await create({ months: 1 })).json();
  expect(first.alias.paid_through).toBe('2026-02-28T12:00:00.000Z');
  const state = f.env.USER_PROFILES.get('user').state;
  vi.setSystemTime(new Date(first.alias.paid_through));
  expect((await f.personal('user', '/personal/my-file', { cid: other }, 'PUT')).status).toBe(410);
  expect((await f.personal('user', '/personal/my-file/renew', { months: 1 })).ok).toBe(true);
  const alias = await state.storage.get('personal-alias:my-file');
  vi.setSystemTime(Date.parse(alias.paid_through) + 30 * 86400000);
  await f.env.USER_PROFILES.get('user').object.alarm();
  expect(await state.storage.get('personal-alias:my-file')).toBeUndefined();
});

it('renews every due alias with one debit/transaction and preserves earlier accounting alarms', async () => {
  await create({ months: 1 });
  await create({ months: 1, name: 'another', request_id: 'second' });
  for (const name of ['my-file', 'another']) await f.personal('user', `/personal/${name}`, { auto_renew: true }, 'PATCH');
  const user = f.env.USER_PROFILES.get('user');
  await user.object.alarm();
  vi.setSystemTime(new Date('2026-02-21T12:00:00Z'));
  await user.object.alarm(); await user.object.alarm();
  expect(await f.balance('user')).toBe(9996);
  const history = await f.env.PAYMENT_RECORDS.get('user').state.storage.get('transactions');
  expect(history).toHaveLength(3);
  const tx = await f.env.PAYMENT_RECORDS.get('user').state.storage.get(`tx:${history[0]}`);
  expect(tx).toMatchObject({ auto_renew: true, amount_cents: 2, alias_months: 2 });
  expect(tx.alias_names.sort()).toEqual(['another', 'my-file']);
  expect(await user.state.storage.getAlarm()).toBeGreaterThan(Date.now());
});

it('enforces key spend caps, revocation and CID restrictions on private map reads', async () => {
  const user = f.env.USER_PROFILES.get('user');
  const profile = await user.state.storage.get('profile');
  profile.api_keys = [{ key_id: 'key', key_hash: 'hash', scopes: ['aliases:read', 'aliases:purchase'], expires_at: '2099-01-01', caveats: { monthly_spend_limit_cents: 1, cids: [cid] } }];
  await user.state.storage.put('profile', profile);
  const spender = { kind: 'key', id: 'key' };
  expect((await create({ spender })).status).toBe(403);
  await create({ spender, months: 1 });
  await create({ name: 'hidden', cid: other, request_id: 'hidden' });
  const identity = { u: 'user', k: 'key', kind: 'key', key_hash: 'hash' };
  const map = await (await f.personal('user', '/resolve-map', { identity })).json();
  expect(map.personal.map(a => a.name)).toEqual(['my-file']);
  const updated = await user.state.storage.get('profile'); updated.api_keys[0].revoked_at = new Date().toISOString();
  await user.state.storage.put('profile', updated);
  expect((await f.personal('user', '/resolve-map', { identity })).status).toBe(401);
});
