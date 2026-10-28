// Rehearse moving an account to a new user ID (todo/clerk_remaining.md CL12-CL13) against
// the local Worker. Needs the Worker started with --var ADMIN_USER_ID:<ADMIN_USER>.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'This test requires a local Worker');
if (!process.env.ADMIN_USER) {
  console.log('SKIP: set ADMIN_USER to the local ADMIN_USER_ID to rehearse an account move');
  process.exit(0);
}

const stamp = Date.now();
const oldUser = `LocalDev move_old_${stamp}`;
const newUser = `LocalDev move_new_${stamp}`;
const admin = `LocalDev ${process.env.ADMIN_USER}`;

async function call(path, { method = 'GET', body, authorization, type = 'application/json' } = {}) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(10000),
    headers: { Authorization: authorization, 'Content-Type': type },
    ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : body }) });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

// The old account: a balance, an upload, an API key
await call('/api/auth/session', { authorization: oldUser });
const upload = await call('/api/content?retention_months=1', { method: 'POST', authorization: oldUser, type: 'application/octet-stream', body: randomBytes(4096) });
assert.equal(upload.status, 201, 'upload');
const key = await call('/api/auth/apikeys', { method: 'POST', authorization: oldUser, body: { scopes: ['balance:read'] } });
assert.equal(key.status, 201, 'key');
const before = (await call('/api/balance', { authorization: oldUser })).data.balance_cents;

// The new account has only signed in (local accounts start with a credit)
await call('/api/auth/session', { authorization: newUser });
const newBefore = (await call('/api/balance', { authorization: newUser })).data.balance_cents;
const from = oldUser.slice('LocalDev '.length);
const to = newUser.slice('LocalDev '.length);

const dry = await call('/api/admin/accounts/move', { method: 'POST', authorization: admin, body: { from, to, dry_run: true } });
assert.equal(dry.status, 200, `dry run: ${JSON.stringify(dry.data)}`);
assert.equal(dry.data.uploads, 1);
assert.equal((await call('/api/balance', { authorization: newUser })).data.balance_cents, newBefore, 'dry run writes nothing');

const moved = await call('/api/admin/accounts/move', { method: 'POST', authorization: admin, body: { from, to } });
assert.equal(moved.status, 200, `move: ${JSON.stringify(moved.data)}`);

assert.equal((await call('/api/balance', { authorization: newUser })).data.balance_cents, before, 'balance moved');
const uploads = (await call('/api/user/uploads', { authorization: newUser })).data;
assert.ok(JSON.stringify(uploads).includes(upload.data.cid), 'upload listed under the new ID');
assert.equal((await call('/api/balance', { authorization: `ApiKey ${key.data.api_key}` })).status, 401, 'old key no longer works');
assert.equal((await call('/api/balance', { authorization: oldUser })).status, 401, 'old account retired');
assert.equal((await call(`/api/content/${upload.data.cid}`, { method: 'DELETE', authorization: newUser })).status, 200, 'new ID owns the upload');

const again = await call('/api/admin/accounts/move', { method: 'POST', authorization: admin, body: { from, to } });
assert.equal(again.data.resumed, true, 'a repeated move resumes');
const regular = await call('/api/admin/accounts/move', { method: 'POST', authorization: newUser, body: { from, to } });
assert.equal(regular.status, 403, 'only admins move accounts');

console.log('PASS: account move rehearsal');
