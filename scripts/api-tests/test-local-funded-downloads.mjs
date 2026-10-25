// Native workerd acceptance: Node unit tests cannot reproduce cross-request
// promise-context cancellation. Requires both local Workers; see the runbook.
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
const content = process.env.CONTENT_BASE_URL || 'http://127.0.0.1:8788';
for (const endpoint of [base, content]) {
  const url = new URL(endpoint);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'This test requires local emulators');
}
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
const config = await (await request(`${base}/api/config`)).json();
assert.equal(config.isLocalMode, true, 'Main Worker must use local authentication');
const owner = `LocalDev funded_acceptance_${Date.now()}`;
async function api(path, method = 'GET', body, authorization = owner) {
  const response = await request(base + path, { method,
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, `${method} ${path} failed: HTTP ${response.status}`);
  return response.json();
}

await api('/api/auth/session');
const before = await api('/api/balance');
const caps = { daily_cap_cents: 1, monthly_cap_cents: 1 };
await api('/api/downloads/budget', 'PUT', { account: caps });
const key = await api('/api/auth/apikeys', 'POST', { name: 'Native funded acceptance', download_budget: caps });
const authorization = `ApiKey ${key.api_key}`;
// Inline content requires no shared R2 emulation. It exercises actual funding,
// caps, receipts and alarms in the main Worker's Durable Object namespace.
const cid = 'AAAAAAAC' + Buffer.from('ok').toString('base64url');
let served = 0;
async function funded(path = `/a/${cid}`, headers = { Authorization: authorization }, method = 'GET') {
  const response = await request(content + path, { method, headers });
  assert.equal(response.status, 200, `Funded request failed: HTTP ${response.status}`);
  assert.equal(response.headers.get('X-Budget'), 'funded');
  if (method === 'GET') assert.equal(await response.text(), 'ok');
  served++;
}
await Promise.all(Array.from({ length: 100 }, (_, i) => funded(undefined, undefined, i % 2 ? 'GET' : 'HEAD')));
const signed = await api('/api/downloads/sign', 'POST', { cids: [cid] }, authorization);
const signedPath = new URL(signed.urls[0].url).pathname;
await funded(signedPath, {});
while (served < 2500) {
  // The last lease has already reserved the entire cap. Both credential forms
  // must keep using that same paid remainder instead of creating new leases.
  const mixSigned = served >= 2255;
  await Promise.all(Array.from({ length: Math.min(25, 2500 - served) }, (_, i) =>
    mixSigned && i % 2 ? funded(signedPath, {}) : funded()));
}
const exhausted = await request(`${content}/a/${cid}`, { headers: { Authorization: authorization } });
assert.equal(exhausted.status, 429);
assert.equal(exhausted.headers.get('X-Budget'), 'exhausted');
const budget = await api('/api/downloads/budget');
assert.equal(budget.spend.account.month_uc, 1000000);
assert.equal(budget.balance_cents, before.balance_cents - 1);
let recorded = false;
for (let i = 0; i < 50; i++) {
  const history = await api('/api/balance/history');
  if (history.transactions?.some(tx => tx.type === 'download_spend')) { recorded = true; break; }
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert.equal(recorded, true, 'The accounting alarm must record the download debit');
console.log('PASS: 2,500 funded GET/HEAD/signed requests, exact 1-cent cap, exhausted fallback and native accounting alarm');
