// Scoped-key acceptance against the local main Worker: a key limited to publishing
// small, short-lived content within a spend limit can do exactly that and nothing else.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'This test requires a local Worker');
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
const owner = `LocalDev scoped_keys_${Date.now()}`;

async function call(path, { method = 'GET', body, authorization = owner, type = 'application/json' } = {}) {
  const response = await request(path, { method, headers: { Authorization: authorization, 'Content-Type': type },
    ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : body }) });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, data };
}

const MB = 1024 * 1024;
let checks = 0;
function expectStatus(result, status, label, error) {
  assert.equal(result.status, status, `${label}: expected HTTP ${status}, got ${result.status} ${JSON.stringify(result.data)}`);
  if (error) assert.equal(result.data?.error, error, `${label}: expected error ${error}`);
  checks++;
}

// The spend limit is exactly one 1 MB, 12-month upload
const price = await call('/api/payments/calculate', { method: 'POST', body: { size_bytes: MB, retention_months: 12 } });
const oneUpload = price.data.cost_cents;
assert.ok(oneUpload > 0, 'A 1 MB upload must cost something');

const created = await call('/api/auth/apikeys', { method: 'POST', body: {
  name: 'Scoped acceptance',
  scopes: ['content:write'],
  caveats: { max_upload_bytes: MB, max_retention_months: 12, monthly_spend_limit_cents: oneUpload }
} });
expectStatus(created, 201, 'Create scoped key');
const key = `ApiKey ${created.data.api_key}`;
const upload = (bytes, months) => call(`/api/content?retention_months=${months}`, {
  method: 'POST', authorization: key, type: 'application/octet-stream', body: randomBytes(bytes) });

const first = await upload(MB, 12);
expectStatus(first, 201, 'Publish 1 MB for 12 months');
expectStatus(await upload(MB + 1, 12), 403, 'Publish 1 MB + 1 byte', 'caveat_violation');
expectStatus(await upload(MB, 13), 403, 'Publish for 13 months', 'caveat_violation');
expectStatus(await upload(MB, 12), 400, 'Spend past the monthly limit', 'spending_limit_exceeded');

const cid = first.data.cid;
expectStatus(await call(`/api/content/${cid}`, { method: 'DELETE', authorization: key }), 403, 'Delete', 'insufficient_scope');
expectStatus(await call(`/api/content/${cid}/extend`, { method: 'POST', authorization: key, body: { months_to_add: 1 } }), 403, 'Extend', 'insufficient_scope');
expectStatus(await call('/api/balance', { authorization: key }), 403, 'Read balance', 'insufficient_scope');
expectStatus(await call('/api/user/uploads', { authorization: key }), 403, 'List uploads', 'insufficient_scope');
expectStatus(await call('/api/account/settings', { method: 'PATCH', authorization: key, body: { default_retention_months: 120 } }), 403, 'Change settings', 'session_required');
expectStatus(await call('/api/suppliers', { authorization: key }), 403, 'List suppliers', 'insufficient_scope');
expectStatus(await call('/api/downloads/sign', { method: 'POST', authorization: key, body: { cids: [cid] } }), 403, 'Sign downloads', 'insufficient_scope');
expectStatus(await call('/api/auth/apikeys', { method: 'POST', authorization: key, body: { scopes: ['content:write'] } }), 403, 'Create another key', 'session_required');
expectStatus(await call('/api/admin/stats', { authorization: key }), 403, 'Admin statistics', 'insufficient_scope');

// Narrowing works; widening does not
const keyId = created.data.key_id;
expectStatus(await call(`/api/auth/apikeys/${keyId}`, { method: 'PATCH', body: { scopes: ['content:write', 'balance:read'] } }), 400, 'Widen scopes', 'SCOPE_WIDENING');
expectStatus(await call(`/api/auth/apikeys/${keyId}`, { method: 'PATCH', body: { caveats: { max_upload_bytes: 2 * MB, max_retention_months: 12, monthly_spend_limit_cents: oneUpload } } }), 400, 'Loosen a caveat', 'CAVEAT_WIDENING');
expectStatus(await call(`/api/auth/apikeys/${keyId}`, { method: 'PATCH', body: { caveats: { max_upload_bytes: 1024, max_retention_months: 12, monthly_spend_limit_cents: oneUpload } } }), 200, 'Tighten a caveat');
expectStatus(await upload(2048, 1), 403, 'Publish above the tightened size', 'caveat_violation');

// Admin keys, when the local Worker runs with --var ADMIN_USER_ID:<ADMIN_USER>
if (process.env.ADMIN_USER) {
  const admin = `LocalDev ${process.env.ADMIN_USER}`;
  expectStatus(await call('/api/admin/keys', { method: 'POST', body: { scopes: ['admin:stats'], expires_in_days: 7 } }), 403, 'Non-admin issues an admin key', 'not_admin');
  expectStatus(await call('/api/admin/keys', { method: 'POST', authorization: admin, body: { scopes: ['admin:stats'], expires_in_days: 91 } }), 400, 'Admin key beyond 90 days');
  const issued = await call('/api/admin/keys', { method: 'POST', authorization: admin, body: { name: 'Stats only', scopes: ['admin:stats'], expires_in_days: 7 } });
  expectStatus(issued, 201, 'Issue an admin:stats key');
  const adminKey = `ApiKey ${issued.data.admin_key}`;
  expectStatus(await call('/api/admin/stats', { authorization: adminKey }), 200, 'Admin key reads statistics');
  expectStatus(await call('/api/admin/costs', { authorization: adminKey }), 403, 'Admin key outside its scope', 'insufficient_scope');
  expectStatus(await call('/api/admin/keys', { method: 'POST', authorization: adminKey, body: { scopes: ['admin:stats'], expires_in_days: 7 } }), 403, 'Admin key issues another', 'session_required');
  expectStatus(await call('/api/balance', { authorization: adminKey }), 403, 'Admin key acts as a user', 'insufficient_scope');
  const adminUserKey = await call('/api/auth/apikeys', { method: 'POST', authorization: admin, body: { scopes: ['balance:read'] } });
  expectStatus(await call('/api/admin/stats', { authorization: `ApiKey ${adminUserKey.data.api_key}` }), 403, 'The admin\'s own user key reaches admin', 'insufficient_scope');
  expectStatus(await call(`/api/admin/keys/${issued.data.key_id}`, { method: 'DELETE', authorization: admin }), 200, 'Revoke the admin key');
  expectStatus(await call('/api/admin/stats', { authorization: adminKey }), 401, 'Revoked admin key');
}

console.log(`PASS: ${checks} scoped-key checks`);
