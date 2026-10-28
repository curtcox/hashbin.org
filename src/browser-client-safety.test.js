import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HashBinClient, verifyCID } from '../frontend/sdk/hashbin.js';
import { generate256tHash } from './utils/hash256t.js';
import { authenticate } from './auth/middleware.js';
import { parseIdentity } from '../workers/256t-content/src/funding.js';
import { verifyDPoP } from './auth/dpop.js';
import { createPkceChallenge, signOAuthJwt, verifyOAuthJwt } from './auth/oauth.js';
import { handleOAuthAuthorize, handleOAuthToken, handleDPoPNonce, handleRevokeAllAuthorizations, handleOAuthRevoke } from './api/oauth.js';
import { handlePublish } from './api/publish.js';
import { handleUploadContent } from './api/content.js';
import { ApplicationRegistry } from './durable-objects/application-registry.js';
import { UserProfile } from './durable-objects/user-profile.js';

function state(initial = {}) {
  const map = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  return {
    storage: { get: async key => structuredClone(map.get(key)), put: async (key, value) => map.set(key, structuredClone(value)), delete: async key => map.delete(key) },
    blockConcurrencyWhile: callback => { const result = queue.then(callback); queue = result.catch(() => {}); return result; }
  };
}
function binding(factory) {
  const instances = new Map();
  return { idFromName: name => name, get: id => { if (!instances.has(id)) instances.set(id, factory(id)); return instances.get(id); } };
}
function storage() { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }
const app = { app_id: 'app_browser', app_name: 'Browser', status: 'active', redirect_uris: ['https://client.example/callback'] };
const session = { authorization: 'LocalDev safety_user', 'content-type': 'text/plain' };
const post = (url, data, headers = {}) => new Request(`https://hashbin.test${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) });
let env;
let writes;
beforeEach(() => {
  writes = [];
  env = {
    ENVIRONMENT: 'local', OAUTH_SIGNING_KEY: 'safety-test-signing-key',
    APPLICATION_REGISTRY: binding(() => new ApplicationRegistry(state({ apps: [app, { ...app, app_id: 'app_other' }] }), {})),
    USER_PROFILES: binding(userId => new UserProfile(state({ profile: { user_id: userId, balance_cents: 1000, uploads: [], api_keys: [], oauth_grants: [], oauth_refresh_tokens: [] } }), {})),
    CONTENT_METADATA: binding(() => ({ fetch: async request => {
      if (new URL(request.url).pathname === '/exists') return Response.json({ exists: false });
      writes.push(await request.json());
      return Response.json({ expires_at: new Date(Date.now() + 86400000).toISOString() });
    } })),
    CONTENT_BUCKET: { put: vi.fn(async () => {}) },
    EXPIRATION_INDEX: binding(() => ({ fetch: async () => Response.json({}) })),
    PAYMENT_RECORDS: binding(() => ({ fetch: async () => Response.json({}) })),
    PLATFORM_STATS: binding(() => ({ fetch: async () => Response.json({}) }))
  };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function tokens({ dpop = false, expiry = 30 } = {}) {
  const memory = storage();
  const client = new HashBinClient({ clientId: app.app_id, redirectUri: app.redirect_uris[0], baseUrl: 'https://hashbin.test', storage: memory, transactionStorage: storage(), fetch: async (url, options) => {
    const request = new Request(url, options);
    return url.endsWith('/oauth/dpop-nonce') ? handleDPoPNonce(request, env) : handleOAuthToken(request, env);
  } });
  const key = dpop ? await client.getDPoPKey() : null;
  const approved = await handleOAuthAuthorize(post('/oauth/authorize', { client_id: app.app_id, redirect_uri: app.redirect_uris[0], response_type: 'code', scope: 'content:write balance:read', spending_limit: 1, expires_in_days: expiry, code_challenge: await createPkceChallenge('verifier'), code_challenge_method: 'S256', ...(key ? { dpop_jkt: key.jkt } : {}) }, session), env);
  const code = new URL(approved.headers.get('location')).searchParams.get('code');
  const response = await handleOAuthToken(post('/oauth/token', { grant_type: 'authorization_code', client_id: app.app_id, redirect_uri: app.redirect_uris[0], code_verifier: 'verifier', code }, key ? { DPoP: await client.dpopProof('https://hashbin.test/oauth/token', 'POST') } : {}), env);
  expect(response.status).toBe(200);
  const data = await response.json();
  client.setTokens(data);
  return { client, data };
}
const refresh = data => handleOAuthToken(post('/oauth/token', { grant_type: 'refresh_token', client_id: app.app_id, ...data }), env);
const profile = () => env.USER_PROFILES.get('safety_user');
const grants = async () => (await (await profile().fetch(new Request('http://internal/oauth/grants'))).json());

describe('browser client safety', () => {
  it.each([1, 64, 65, 1024])('verifies the CID and length of %i bytes, including typed-array slices', async size => {
    const bytes = new Uint8Array(size).fill(72);
    const cid = await generate256tHash(bytes);
    expect(await verifyCID(cid, bytes)).toBe(true);
    expect(await verifyCID(cid, new Uint8Array(size + 1).fill(72))).toBe(false);
    expect(await verifyCID(cid, new Uint8Array(size).fill(71))).toBe(false);
    const padded = new Uint8Array(size + 10); padded.set(bytes, 5);
    expect(await verifyCID(cid, padded.subarray(5, size + 5))).toBe(true);
  });

  it('rejects substituted downloads and upload CIDs before returning them to clients', async () => {
    const cid = await generate256tHash(new TextEncoder().encode('original'));
    const client = new HashBinClient({ clientId: app.app_id, redirectUri: app.redirect_uris[0], fetch: async () => new Response('replaced') });
    await expect(client.retrieve(cid)).rejects.toThrow('does not match CID');
    client.memoryTokens = { accessToken: 'test' };
    client.fetch = async () => Response.json({ cid });
    await expect(client.save('changed')).rejects.toThrow('does not match content');
  });

  it('requires the refresh client and revokes the entire family after rotated-token reuse', async () => {
    const { data } = await tokens();
    expect((await refresh({ client_id: undefined, refresh_token: data.refresh_token })).status).toBe(400);
    expect((await refresh({ client_id: 'app_other', refresh_token: data.refresh_token })).status).toBe(400);
    const rotated = await (await refresh({ refresh_token: data.refresh_token })).json();
    expect(rotated.refresh_token).toBeTruthy();
    expect((await refresh({ refresh_token: data.refresh_token })).status).toBe(400);
    expect((await refresh({ refresh_token: rotated.refresh_token })).status).toBe(400);
    expect((await authenticate(new Request('https://hashbin.test/api/balance', { headers: { authorization: `Bearer ${rotated.access_token}` } }), env)).authenticated).toBe(false);
    expect((await grants()).security_events.some(event => event.type === 'refresh_token_reuse')).toBe(true);
  });

  it('revokes a grant when a stale tab disconnects with its already-rotated refresh token', async () => {
    const { data } = await tokens();
    const rotated = await (await refresh({ refresh_token: data.refresh_token })).json();
    await handleOAuthRevoke(post('/oauth/revoke', { token: data.refresh_token, token_type_hint: 'refresh_token' }), env);
    expect((await refresh({ refresh_token: rotated.refresh_token })).status).toBe(400);
    expect((await authenticate(new Request('https://hashbin.test/api/balance', { headers: { authorization: `Bearer ${rotated.access_token}` } }), env)).authenticated).toBe(false);
  });

  it('expires idle refresh tokens at seven days and families after ninety days', async () => {
    const { data } = await tokens();
    const originalTime = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(originalTime + 7 * 86400000 + 1000);
    expect((await refresh({ refresh_token: data.refresh_token })).status).toBe(400);
    vi.useRealTimers();
    const oldProfile = await (await profile().fetch(new Request('http://internal/profile'))).json();
    const record = oldProfile.oauth_refresh_tokens[0];
    expect(new Date(record.expires_at) - new Date(record.created_at)).toBeLessThanOrEqual(7 * 86400000);
    expect(data.expires_in).toBe(900);
  });

  it('does not extend a refresh family beyond ninety days despite regular rotation', async () => {
    const { data } = await tokens({ expiry: null });
    const start = Date.now();
    let token = data.refresh_token;
    vi.useFakeTimers();
    for (let days = 6; days <= 84; days += 6) {
      vi.setSystemTime(start + days * 86400000);
      const response = await refresh({ refresh_token: token });
      expect(response.status).toBe(200);
      token = (await response.json()).refresh_token;
    }
    vi.setSystemTime(start + 90 * 86400000 + 1000);
    expect((await refresh({ refresh_token: token })).status).toBe(400);
  });

  it('binds access and refresh to a non-extractable P-256 key and rejects missing/wrong/replayed proofs', async () => {
    const { client, data } = await tokens({ dpop: true });
    expect(data.token_type).toBe('DPoP');
    const key = await client.getDPoPKey();
    expect(key.pair.privateKey.extractable).toBe(false);
    expect((await verifyOAuthJwt(data.access_token, env.OAUTH_SIGNING_KEY)).cnf.jkt).toBe(key.jkt);
    const url = 'https://hashbin.test/api/balance';
    const request = async (overrides = {}) => new Request(url, { headers: { authorization: `DPoP ${data.access_token}`, DPoP: await client.dpopProof(url, 'GET', data.access_token), ...overrides } });
    expect((await authenticate(await request(), env)).authenticated).toBe(true);
    expect((await authenticate(await request({ authorization: `Bearer ${data.access_token}` }), env)).authenticated).toBe(false);
    const proof = await client.dpopProof(url, 'GET', data.access_token);
    expect((await authenticate(new Request(url, { headers: { authorization: `DPoP ${data.access_token}`, DPoP: proof } }), env)).authenticated).toBe(true);
    expect((await authenticate(new Request(url, { headers: { authorization: `DPoP ${data.access_token}`, DPoP: proof } }), env)).authenticated).toBe(false);
    expect((await refresh({ refresh_token: data.refresh_token })).status).toBe(400);
    const other = new HashBinClient({ clientId: 'other', redirectUri: app.redirect_uris[0], baseUrl: client.baseUrl, fetch: client.fetch });
    const wrong = await other.dpopProof('https://hashbin.test/oauth/token', 'POST');
    expect((await handleOAuthToken(post('/oauth/token', { grant_type: 'refresh_token', client_id: app.app_id, refresh_token: data.refresh_token }, { DPoP: wrong }), env)).status).toBe(400);
    expect((await client.refreshAccessToken()).tokenType).toBe('DPoP');
    expect((await grants()).authorizations).toHaveLength(1);
  });

  it('enforces the same token binding on the dedicated funded-content worker', async () => {
    const { client, data } = await tokens({ dpop: true });
    const payload = await verifyOAuthJwt(data.access_token, env.OAUTH_SIGNING_KEY);
    const token = await signOAuthJwt({ ...payload, scopes: ['downloads:spend'] }, env.OAUTH_SIGNING_KEY);
    const url = 'https://256t.test/a/example-cid';
    await expect(parseIdentity(new Request(url, { headers: { authorization: `Bearer ${token}` } }), env, 'example-cid', null, true)).rejects.toThrow('DPoP authorization');
    await expect(parseIdentity(new Request(url, { headers: { authorization: `DPoP ${token}` } }), env, 'example-cid', null, true)).rejects.toThrow();
    const proof = await client.dpopProof(url, 'GET', token);
    const headers = { authorization: `DPoP ${token}`, DPoP: proof };
    expect(await parseIdentity(new Request(url, { headers }), env, 'example-cid', null, true)).toMatchObject({ u: 'safety_user', kind: 'oauth', k: payload.grant_id });
    await expect(parseIdentity(new Request(url, { headers }), env, 'example-cid', null, true)).rejects.toThrow('replay');
  });

  it('checks DPoP nonce, method, URL, token hash, signature, and proof expiry', async () => {
    const { client, data } = await tokens({ dpop: true });
    const url = 'https://hashbin.test/api/balance';
    const proof = await client.dpopProof(url, 'GET', data.access_token);
    await expect(verifyDPoP(new Request(url, { method: 'POST', headers: { DPoP: proof } }), env, { accessToken: data.access_token })).rejects.toThrow();
    await expect(verifyDPoP(new Request(url + '/other', { headers: { DPoP: proof } }), env)).rejects.toThrow();
    await expect(verifyDPoP(new Request(url, { headers: { DPoP: proof } }), env, { accessToken: 'wrong' })).rejects.toThrow();
    const corrupted = proof.split('.');
    corrupted[2] = (corrupted[2][0] === 'A' ? 'B' : 'A') + corrupted[2].slice(1);
    await expect(verifyDPoP(new Request(url, { headers: { DPoP: corrupted.join('.') } }), env)).rejects.toThrow('signature');
    client.nonce = 'invalid';
    await expect(verifyDPoP(new Request(url, { headers: { DPoP: await client.dpopProof(url, 'GET') } }), env)).rejects.toThrow();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 120000);
    await expect(verifyDPoP(new Request(url, { headers: { DPoP: proof } }), env)).rejects.toThrow();
  });

  it('serializes refreshes across SDK instances and rechecks shared storage under the lock', async () => {
    const memory = storage();
    let queue = Promise.resolve();
    const locks = { request: vi.fn((_name, action) => { const promise = queue.then(action); queue = promise; return promise; }) };
    vi.stubGlobal('navigator', { locks });
    const fetch = vi.fn(async () => Response.json({ access_token: 'new', refresh_token: 'rotated', expires_in: 900 }));
    const options = { clientId: app.app_id, redirectUri: app.redirect_uris[0], storage: memory, fetch };
    const one = new HashBinClient(options), two = new HashBinClient(options);
    one.setTokens({ access_token: 'old', refresh_token: 'old', expires_in: -1 });
    await Promise.all([one.refreshAccessToken(), two.refreshAccessToken()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(locks.request).toHaveBeenCalledWith(`hashbin:refresh:${app.app_id}`, expect.any(Function));
  });

  it.each(['-1', '1.5', '', 'NaN', '9007199254740992'])('rejects invalid upload ceilings (%s) before charging', async maximum => {
    const response = await handleUploadContent(new Request(`https://hashbin.test/api/content?max_cost_cents=${maximum}`, { method: 'POST', headers: session, body: 'x'.repeat(65) }), env);
    expect(response.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('rejects charges above the upload ceiling before storing or debiting', async () => {
    const response = await handleUploadContent(new Request('https://hashbin.test/api/content?max_cost_cents=0', { method: 'POST', headers: session, body: 'x'.repeat(65) }), env);
    expect(response.status).toBe(409);
    expect(writes).toHaveLength(0);
    expect((await (await profile().fetch(new Request('http://internal/balance'))).json()).balance_cents).toBe(1000);
  });

  it('binds a single-use approval to exact bytes, type, user, retention and price', async () => {
    const body = 'a'.repeat(65);
    const prepare = new Request('https://hashbin.test/api/publish?client_id=app_browser&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&retention_months=2', { method: 'POST', headers: session, body });
    const quote = await (await handlePublish(prepare, env)).json();
    expect(quote).toMatchObject({ cost_cents: 1, size_bytes: 65, retention_months: 2, balance_cents: 1000 });
    const approve = (value = body, headers = {}) => new Request('https://hashbin.test/api/publish', { method: 'POST', headers: { ...session, 'x-hashbin-approval': quote.approval, ...headers }, body: value });
    expect((await handlePublish(approve('b'.repeat(65)), env)).status).toBe(400);
    expect((await handlePublish(approve(body, { authorization: 'LocalDev other_user' }), env)).status).toBe(400);
    expect((await handlePublish(approve(body, { 'content-type': 'text/html' }), env)).status).toBe(400);
    expect(writes).toHaveLength(0);
    const response = await handlePublish(approve(), env);
    expect(response.status).toBe(201);
    expect((await response.json()).cid).toBe(quote.cid);
    expect(writes[0]).toMatchObject({ retention_months: 2, amount_cents: 1 });
    expect((await handlePublish(approve(), env)).status).toBe(409);
    expect(writes).toHaveLength(1);
  });

  it('rejects expired approvals and multipart reinterpretation', async () => {
    const claim = await signOAuthJwt({ token_type: 'publish_approval', exp: Math.floor(Date.now() / 1000) - 1 }, env.OAUTH_SIGNING_KEY);
    expect((await handlePublish(new Request('https://hashbin.test/api/publish', { method: 'POST', headers: { ...session, 'x-hashbin-approval': claim }, body: 'test' }), env)).status).toBe(400);
    expect((await handlePublish(new Request('https://hashbin.test/api/publish?client_id=app_browser&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback', { method: 'POST', headers: { ...session, 'content-type': 'multipart/form-data; boundary=test' }, body: 'test' }), env)).status).toBe(400);
  });

  it('requires shared-origin acknowledgment and reports only matching app names', async () => {
    const registry = new ApplicationRegistry(state(), {});
    const create = data => registry.fetch(post('/apps', { app_name: 'Shared', redirect_uris: ['https://person.github.io/tool/callback'], owner_user_id: 'owner', ...data }));
    expect((await create({})).status).toBe(400);
    const first = await (await create({ shared_origin_acknowledged: true })).json();
    const second = await (await create({ shared_origin_acknowledged: true, app_name: '<img onerror=alert(1)>' })).json();
    const details = await (await registry.fetch(new Request(`http://internal/apps/${first.app_id}`))).json();
    expect(details.origin_warnings[0].apps).toEqual([{ app_id: second.app_id, app_name: '<img onerror=alert(1)>' }]);
  });

  it('shows first use and cap notifications and revokes all app access', async () => {
    const { data } = await tokens();
    await authenticate(new Request('https://hashbin.test/api/balance', { headers: { authorization: `Bearer ${data.access_token}` } }), env);
    await profile().fetch(post('/balance/debit', { amount_cents: 80, spender: { kind: 'oauth', id: (await grants()).authorizations[0].grant_id } }));
    const activity = await grants();
    expect(activity.security_events.map(event => event.type)).toEqual(['grant_first_use', 'grant_spend_80_percent']);
    expect(activity.authorizations[0].last_used_at).toBeTruthy();
    expect((await handleRevokeAllAuthorizations(new Request('https://hashbin.test/api/account/authorizations', { method: 'DELETE', headers: session }), env)).status).toBe(200);
    expect((await grants()).authorizations).toEqual([]);
    expect((await refresh({ refresh_token: data.refresh_token })).status).toBe(400);
  });
});
