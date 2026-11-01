import assert from 'node:assert/strict';
import { generate256tHash } from '../../src/utils/hash256t.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Aliases acceptance requires a local Worker');
const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const name = `alias-${stamp}`, seller = `alias-seller-${stamp}`, buyer = `alias-buyer-${stamp}`;
const clientIp = `2001:db8::${Date.now().toString(16).slice(-4)}`;
const cid = await generate256tHash(new TextEncoder().encode('alias acceptance'));
const nextCid = await generate256tHash(new TextEncoder().encode('repointed content'));
async function call(user, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(15000),
    headers: { ...(user ? { Authorization: `LocalDev ${user}` } : {}), 'Content-Type': 'application/json', 'CF-Connecting-IP': clientIp },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const path = `/api/aliases/${name}`;
assert.equal((await call(seller, '/api/auth/session')).status, 200);
assert.equal((await call(buyer, '/api/auth/session')).status, 200);
const claim = { cid, years: 1, request_id: 'claim' };
assert.equal((await call(seller, `${path}/claim`, 'POST', claim)).status, 201);
assert.equal((await call(seller, `${path}/claim`, 'POST', claim)).status, 201, 'idempotent claim');
assert.equal((await call(buyer, `${path}/claim`, 'POST', { cid })).status, 409, 'unique owner');
assert.equal((await call(seller, `${path}/listing`, 'PUT', { price_cents: 300 })).status, 200);
assert.equal((await call(buyer, `${path}/buy`, 'POST', { price_cents: 299 })).status, 409, 'stale buy price');
const offered = await call(buyer, `${path}/offers`, 'POST', { amount_cents: 200, request_id: 'offer' });
assert.equal(offered.status, 201);
assert.equal((await call(buyer, '/api/balance')).data.balance_cents, 800, 'offer hold');
assert.equal((await call(seller, `${path}/offers/${offered.data.offer_id}/accept`, 'POST', { request_id: 'accept' })).status, 200);
assert.equal((await call(seller, '/api/balance')).data.balance_cents, 1080, 'seller receives net proceeds');
assert.equal((await call(buyer, '/api/balance')).data.balance_cents, 800, 'accepted hold is not charged again');
assert.equal((await call(seller, `${path}/value`, 'PUT', { cid: nextCid })).status, 403);
assert.equal((await call(buyer, `${path}/value`, 'PUT', { cid: nextCid })).status, 200);
const info = await call(null, path);
assert.equal(info.data.cid, nextCid);
assert.ok(!JSON.stringify(info.data).includes(buyer), 'public info does not reveal the buyer');
assert.equal((await call(null, `${path}/resolve`)).data.cid, nextCid);
const personal = await call(buyer, '/api/user/aliases/personal', 'POST', { name, cid, months: 1, request_id: 'personal' });
assert.equal(personal.status, 201);
assert.equal((await call(buyer, `${path}/resolve`)).data.source, 'personal');
assert.equal((await call(buyer, `${path}/resolve`)).data.cid, cid);
assert.equal((await call(null, `${path}/resolve`)).data.cid, nextCid);
assert.equal((await call(buyer, `/api/user/aliases/personal/${name}/renew`, 'POST', { months: 1, request_id: 'personal-renew' })).status, 200);
assert.equal((await call(buyer, `/api/user/aliases/personal/${name}`, 'DELETE')).status, 200);
assert.equal((await call(buyer, '/api/user/aliases')).data.personal.length, 0);
const report = await call(null, '/api/disputes', 'POST', { target_type: 'alias', name, claim_type: 'impersonation',
  evidence: 'Local acceptance report: this alias is being used to impersonate another account.', contact: { type: 'email', value: 'test@example.com' } });
assert.equal(report.status, 201, JSON.stringify(report.data));
assert.equal((await call(null, `${path}/disputes`)).data.disputes.length, 1);
console.log('Aliases: claim → list → hold → accept → repoint, private override, history and report passed.');
