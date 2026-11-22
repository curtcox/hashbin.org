/**
 * devicebasedauth.org credentials and account linking, end to end through the Worker with a
 * fake DBA issuer: its key signs credentials, status lists and ID tokens with the vendored
 * issuer helpers, and a stubbed fetch serves its JWKS, status list and OIDC endpoints.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import { memoryState } from '../../test-utils/alias-fixture.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { DbaLink } from '../durable-objects/dba-link.js';
import { authenticate, requireAuth } from './middleware.js';
import { dbaIssuer, dbaSpendLimitCents, resetDbaAuth } from './dba.js';
import { spenderOf } from './scopes.js';
import { issuerSigner, jwksFor, signCredential, signAccessToken, signStatusList } from '../vendor/devicebasedauth/issuer.js';
import { createProof } from '../vendor/devicebasedauth/credential.js';
import { exportPublicJwk, generateKeyPair, jwkThumbprint, signJws } from '../vendor/devicebasedauth/jose.js';

const ISSUER = 'https://dba.test';
const ORIGIN = 'http://localhost:8787';
const STATUS_URI = `${ISSUER}/status/1`;
const DBA_ACCOUNT = 'alice_dba';
const now = () => Math.floor(Date.now() / 1000);

let env, issuerKey, signer, device, statusBytes, oidc, fetchCalls;

function namespace(Class) {
  const objects = new Map();
  return {
    idFromName: name => name,
    get: name => {
      if (!objects.has(name)) objects.set(name, new Class(memoryState(), env));
      return objects.get(name);
    },
    objects
  };
}

async function newIssuerKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { kid: 'test-1', jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

async function newDevice() {
  const pair = await generateKeyPair(true);
  const publicJwk = await exportPublicJwk(pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk, jkt: await jwkThumbprint(publicJwk) };
}

function credentialPayload(grants, overrides = {}) {
  const t = now();
  return {
    iss: ISSUER, sub: 'dev_LAPTOP0001', acct: DBA_ACCOUNT, aud: ['hashbin.org'],
    cid: 'crd_CRED000001', jti: 'crd_CRED000001.1', iat: t, nbf: t, exp: t + 3600,
    cnf: { jkt: device.jkt }, grants, status: { status_list: { idx: 5, uri: STATUS_URI } }, ver: 1,
    ...overrides
  };
}

const issue = (grants, overrides) => signCredential(credentialPayload(grants, overrides), signer);

async function dbaRequest(credential, { method = 'GET', path = '/api/balance', proof = true, body } = {}) {
  const url = `${ORIGIN}${path}`;
  const headers = { Authorization: `DBA ${credential}` };
  if (proof === true) headers.DPoP = await createProof({ privateKey: device.privateKey, publicJwk: device.publicJwk, method, url, credential });
  else if (proof) headers.DPoP = proof;
  return new Request(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}

const session = (path, init = {}, user = 'alice') => new Request(`${ORIGIN}${path}`, {
  ...init, headers: { Authorization: `LocalDev ${user}`, 'content-type': 'application/json', ...(init.headers || {}) }
});
const call = request => worker.fetch(request, env, {});

/** The fake DBA: JWKS, one status list, and an OIDC provider that signs in DBA_ACCOUNT. */
function fakeDba() {
  return vi.fn(async (input, init = {}) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url === `${ISSUER}/.well-known/jwks.json`) return Response.json(jwksFor([issuerKey]));
    if (url === STATUS_URI) return new Response(await signStatusList({ uri: STATUS_URI, bytes: statusBytes, issuer: ISSUER }, signer));
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Response.json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/oauth/authorize`, token_endpoint: `${ISSUER}/oauth/token`, jwks_uri: `${ISSUER}/.well-known/jwks.json` });
    }
    if (url === `${ISSUER}/oauth/token`) {
      const form = new URLSearchParams(init.body);
      oidc.tokenRequests.push(Object.fromEntries(form));
      if (form.get('code') !== 'good-code') return Response.json({ error: 'invalid_grant', error_description: 'Unknown code' }, { status: 400 });
      const t = now();
      const idToken = await signJws({ typ: 'JWT', kid: issuerKey.kid }, { iss: ISSUER, aud: 'hashbin.org', sub: oidc.account, acct: oidc.account, nonce: oidc.nonce, iat: t, exp: t + 300 }, signer.key);
      return Response.json({ id_token: idToken, token_type: 'Bearer' });
    }
    return new Response('not found', { status: 404 });
  });
}

/** Run the link flow as `user` for DBA account `account`; returns the finish response. */
async function link(user = 'alice', account = DBA_ACCOUNT) {
  const started = await call(session('/api/auth/dba/link/start', { method: 'POST' }, user));
  expect(started.status).toBe(200);
  const authorize = new URL((await started.json()).url);
  oidc.nonce = authorize.searchParams.get('nonce');
  oidc.account = account;
  return call(session('/api/auth/dba/link/finish', { method: 'POST', body: JSON.stringify({ code: 'good-code', state: authorize.searchParams.get('state') }) }, user));
}

beforeEach(async () => {
  resetDbaAuth();
  issuerKey = await newIssuerKey();
  signer = await issuerSigner(issuerKey);
  device = await newDevice();
  statusBytes = new Uint8Array(16);
  oidc = { tokenRequests: [], nonce: null, account: DBA_ACCOUNT };
  fetchCalls = [];
  env = { ENVIRONMENT: 'local', DBA_ISSUER: ISSUER };
  env.USER_PROFILES = namespace(UserProfile);
  env.DBA_LINKS = namespace(DbaLink);
  vi.stubGlobal('fetch', fakeDba());
});

afterEach(() => vi.unstubAllGlobals());

describe('linking a devicebasedauth.org account', () => {
  it('links through OIDC with server-side state, and shows the link', async () => {
    const started = await call(session('/api/auth/dba/link/start', { method: 'POST' }));
    const authorize = new URL((await started.json()).url);
    expect(authorize.origin + authorize.pathname).toBe(`${ISSUER}/oauth/authorize`);
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: 'hashbin.org', redirect_uri: `${ORIGIN}/auth/dba/callback`, code_challenge_method: 'S256', response_type: 'code'
    });
    // The PKCE verifier and nonce stay on the server
    const pending = await env.USER_PROFILES.get('alice').state.storage.get('dba-oidc-state');
    expect(pending.state).toBe(authorize.searchParams.get('state'));
    expect(authorize.searchParams.get('code_challenge')).not.toBe(pending.verifier);

    oidc.nonce = authorize.searchParams.get('nonce');
    const finished = await call(session('/api/auth/dba/link/finish', { method: 'POST', body: JSON.stringify({ code: 'good-code', state: pending.state }) }));
    expect(finished.status).toBe(200);
    expect(await finished.json()).toMatchObject({ linked: true, account: DBA_ACCOUNT });
    expect(oidc.tokenRequests[0]).toMatchObject({ code_verifier: pending.verifier, client_id: 'hashbin.org', redirect_uri: `${ORIGIN}/auth/dba/callback` });

    const status = await call(session('/api/auth/dba/link'));
    expect(await status.json()).toMatchObject({ linked: true, account: DBA_ACCOUNT, issuer: ISSUER });
    expect((await env.DBA_LINKS.get(DBA_ACCOUNT).fetch(new Request('https://x/link'))).status).toBe(200);
  });

  it('uses the registered production callback outside local mode', async () => {
    const { dbaOidcClient } = await import('./dba.js');
    const client = dbaOidcClient({ ENVIRONMENT: 'production', DBA_ISSUER: ISSUER }, new Request('https://hashbin.org/api/auth/dba/link/start'));
    const { url } = await client.begin();
    expect(new URL(url).searchParams.get('redirect_uri')).toBe('https://hashbin.org/auth/dba/callback');
  });

  it('refuses a state the server did not issue, and uses each state once', async () => {
    const started = await call(session('/api/auth/dba/link/start', { method: 'POST' }));
    const authorize = new URL((await started.json()).url);
    oidc.nonce = authorize.searchParams.get('nonce');
    const forged = await call(session('/api/auth/dba/link/finish', { method: 'POST', body: JSON.stringify({ code: 'good-code', state: 'attacker-state' }) }));
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ error: 'link_failed', dba_error: 'invalid_state' });
    // The failed attempt consumed the pending state
    const replay = await call(session('/api/auth/dba/link/finish', { method: 'POST', body: JSON.stringify({ code: 'good-code', state: authorize.searchParams.get('state') }) }));
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('no_pending_link');
    expect(oidc.tokenRequests).toHaveLength(0);
  });

  it('reports a refused authorization code', async () => {
    const started = await call(session('/api/auth/dba/link/start', { method: 'POST' }));
    const state = new URL((await started.json()).url).searchParams.get('state');
    const response = await call(session('/api/auth/dba/link/finish', { method: 'POST', body: JSON.stringify({ code: 'bad-code', state }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'link_failed', dba_error: 'invalid_grant' });
  });

  it('links a DBA account to at most one HashBin user', async () => {
    expect((await link('alice')).status).toBe(200);
    const second = await link('mallory');
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('dba_account_linked_elsewhere');
    expect(await (await call(session('/api/auth/dba/link', {}, 'mallory'))).json()).toMatchObject({ linked: false });
  });

  it('unlinks, after which another user may link the DBA account', async () => {
    await link('alice');
    const unlinked = await call(session('/api/auth/dba/link', { method: 'DELETE' }));
    expect(await unlinked.json()).toEqual({ linked: false, unlinked: DBA_ACCOUNT });
    expect(await (await call(session('/api/auth/dba/link'))).json()).toMatchObject({ linked: false, account: null });
    expect((await link('bob')).status).toBe(200);
  });

  it('lets a user take over a link whose owner no longer names it', async () => {
    await link('alice');
    // Alice's profile lost the link (e.g. her account was moved) but the index still names her
    const profile = await env.USER_PROFILES.get('alice').state.storage.get('profile');
    delete profile.dba_link;
    await env.USER_PROFILES.get('alice').state.storage.put('profile', profile);
    expect((await link('bob')).status).toBe(200);
  });

  it('keeps linking to the account session', async () => {
    await link('alice');
    const credential = await issue([{ actions: ['hashbin:session', 'hashbin:balance:read'] }]);
    for (const [method, path] of [['GET', '/api/auth/dba/link'], ['DELETE', '/api/auth/dba/link'], ['POST', '/api/auth/dba/link/start']]) {
      const response = await call(await dbaRequest(credential, { method, path }));
      expect(response.status, `${method} ${path}`).toBe(403);
      expect((await response.json()).error).toBe('session_required');
    }
  });
});

describe('authenticating with a devicebasedauth.org credential', () => {
  beforeEach(async () => { expect((await link('alice')).status).toBe(200); });

  it('maps granted hashbin: actions to scopes and acts as the linked user', async () => {
    const credential = await issue([{ actions: ['hashbin:balance:read', 'hashbin:content:write', 'other:thing'] }, { actions: ['hashbin:session'] }]);
    const auth = await authenticate(await dbaRequest(credential), env);
    expect(auth).toMatchObject({ authenticated: true, user: {
      userId: 'alice', authMethod: 'dba', session: false, scopes: ['content:write', 'balance:read'], caveats: {},
      dba: { account: DBA_ACCOUNT, deviceId: 'dev_LAPTOP0001', credentialId: 'crd_CRED000001', kind: 'device' }
    } });
    expect(auth.user.profile.user_id).toBe('alice');

    const response = await call(await dbaRequest(credential));
    expect(response.status).toBe(200);
    expect((await response.json()).balance_cents).toBe(1000);
  });

  it('denies a scope the credential was not granted', async () => {
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    const response = await call(await dbaRequest(credential, { path: '/api/balance/history' }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('insufficient_scope');
  });

  it('never grants downloads:spend yet', async () => {
    const credential = await issue([{ actions: ['hashbin:downloads:spend', 'hashbin:balance:read'] }]);
    expect((await authenticate(await dbaRequest(credential), env)).user.scopes).toEqual(['balance:read']);
  });

  it('applies grant conditions such as time windows', async () => {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = days[new Date().getUTCDay()];
    const window = list => ({ tz: 'UTC', windows: [{ days: list, from: '00:00', to: '24:00' }] });
    const otherDays = await issue([{ actions: ['hashbin:balance:read'], when: window(days.filter(day => day !== today)) }]);
    expect((await call(await dbaRequest(otherDays))).status).toBe(403);
    const todayOnly = await issue([{ actions: ['hashbin:balance:read'], when: window([today]) }]);
    expect((await call(await dbaRequest(todayOnly))).status).toBe(200);
  });

  it('maps the tightest spend_usd_per_month to monthly_spend_limit_cents', async () => {
    const credential = await issue([
      { actions: ['hashbin:content:write'], limits: { spend_usd_per_month: 5 } },
      { actions: ['hashbin:aliases:purchase'], limits: { spend_usd_per_month: 0.29 } }
    ]);
    const auth = await authenticate(await dbaRequest(credential), env);
    expect(auth.user.caveats).toEqual({ monthly_spend_limit_cents: 29 });
    expect(spenderOf(auth)).toEqual({ kind: 'dba', id: 'crd_CRED000001', account: DBA_ACCOUNT,
      scopes: ['aliases:purchase', 'content:write'].filter(s => auth.user.scopes.includes(s)), caveats: { monthly_spend_limit_cents: 29 } });
    expect(dbaSpendLimitCents({ spend_usd_per_month: 0 })).toBe(0);
    expect(dbaSpendLimitCents({})).toBeUndefined();
  });

  it('enforces the spend cap on balance debits, and stops spending once unlinked', async () => {
    const credential = await issue([{ actions: ['hashbin:content:write'], limits: { spend_usd_per_month: 5 } }]);
    const spender = spenderOf(await authenticate(await dbaRequest(credential), env));
    const debit = amount => env.USER_PROFILES.get('alice').fetch(new Request('https://internal/balance/debit', {
      method: 'POST', body: JSON.stringify({ amount_cents: amount, spender, required_scope: 'content:write' })
    }));
    expect((await debit(400)).status).toBe(200);
    const over = await debit(200);
    expect(over.status).toBe(400);
    expect((await over.json()).error).toBe('spending_limit_exceeded');
    expect((await debit(100)).status).toBe(200);

    await call(session('/api/auth/dba/link', { method: 'DELETE' }));
    expect((await (await debit(1)).json()).error).toBe('invalid_credential');
  });

  it('refuses a credential from an unlinked DBA account with 403', async () => {
    const credential = await issue([{ actions: ['hashbin:balance:read'] }], { acct: 'stranger' });
    const response = await call(await dbaRequest(credential));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'AUTH_DBA_NOT_LINKED', dba_account: 'stranger' });
  });

  it('refuses credentials once the account is unlinked', async () => {
    await call(session('/api/auth/dba/link', { method: 'DELETE' }));
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    expect((await authenticate(await dbaRequest(credential), env)).error).toBe('AUTH_DBA_NOT_LINKED');
  });

  it('refuses a revoked credential with 401', async () => {
    statusBytes[0] = 1 << 5; // idx 5
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    const response = await call(await dbaRequest(credential));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'AUTH_KEY_REVOKED', dba_code: 'revoked' });
  });

  it('requires a valid DPoP proof for this request, used once', async () => {
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    const missing = await call(await dbaRequest(credential, { proof: false }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: 'AUTH_DBA_PROOF_INVALID', dba_code: 'proof_required' });

    const wrongUrl = await createProof({ privateKey: device.privateKey, publicJwk: device.publicJwk, method: 'GET', url: `${ORIGIN}/api/balance/history`, credential });
    expect(await (await call(await dbaRequest(credential, { proof: wrongUrl }))).json()).toMatchObject({ error: 'AUTH_DBA_PROOF_INVALID', dba_code: 'invalid_proof' });

    const thief = await newDevice();
    const stolen = await createProof({ privateKey: thief.privateKey, publicJwk: thief.publicJwk, method: 'GET', url: `${ORIGIN}/api/balance`, credential });
    expect(await (await call(await dbaRequest(credential, { proof: stolen }))).json()).toMatchObject({ dba_code: 'key_mismatch' });

    const proof = await createProof({ privateKey: device.privateKey, publicJwk: device.publicJwk, method: 'GET', url: `${ORIGIN}/api/balance`, credential });
    expect((await call(await dbaRequest(credential, { proof }))).status).toBe(200);
    expect(await (await call(await dbaRequest(credential, { proof }))).json()).toMatchObject({ dba_code: 'replayed_proof' });
  });

  it('refuses credentials for another audience, issuer or signing key', async () => {
    const otherAudience = await issue([{ actions: ['hashbin:balance:read'] }], { aud: ['cronly.org'] });
    expect((await authenticate(await dbaRequest(otherAudience), env)).error).toBe('AUTH_INVALID_FORMAT');
    const forger = await issuerSigner(await newIssuerKey());
    const forged = await signCredential(credentialPayload([{ actions: ['hashbin:balance:read'] }]), forger);
    expect((await call(await dbaRequest(forged))).status).toBe(401);
  });

  it('refuses an expired credential', async () => {
    const t = now() - 7200;
    const credential = await issue([{ actions: ['hashbin:balance:read'] }], { iat: t, nbf: t, exp: t + 60 });
    expect((await authenticate(await dbaRequest(credential), env)).error).toBe('AUTH_EXPIRED');
  });

  it('accepts DBA access tokens as bearer tokens, before Clerk', async () => {
    const payload = credentialPayload([{ actions: ['hashbin:balance:read'] }]);
    delete payload.cnf;
    const token = await signAccessToken({ ...payload, exp: now() + 600 }, signer);
    const request = new Request(`${ORIGIN}/api/balance`, { headers: { Authorization: `Bearer ${token}` } });
    const auth = await authenticate(request, env);
    expect(auth.user).toMatchObject({ userId: 'alice', authMethod: 'dba', scopes: ['balance:read'], dba: { kind: 'access' } });
    expect((await call(new Request(`${ORIGIN}/api/balance`, { headers: { Authorization: `Bearer ${token}` } }))).status).toBe(200);
  });

  it('fails closed with 503 when DBA cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    const response = await call(await dbaRequest(credential));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('AUTH_DBA_UNAVAILABLE');
  });

  it('caches DBA keys and status lists across requests', async () => {
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    fetchCalls.length = 0;
    for (let i = 0; i < 3; i++) expect((await call(await dbaRequest(credential))).status).toBe(200);
    expect(fetchCalls.filter(url => url.endsWith('/jwks.json'))).toHaveLength(1);
    expect(fetchCalls.filter(url => url === STATUS_URI)).toHaveLength(1);
  });

  it('refuses a deleted account', async () => {
    const profile = await env.USER_PROFILES.get('alice').state.storage.get('profile');
    await env.USER_PROFILES.get('alice').state.storage.put('profile', { ...profile, deleted_at: new Date().toISOString() });
    const credential = await issue([{ actions: ['hashbin:balance:read'] }]);
    const auth = await authenticate(await dbaRequest(credential), env);
    expect(auth.error).toBe('AUTH_USER_DELETED');
    expect(requireAuth(auth).status).toBe(401);
  });
});

describe('DBA issuer configuration', () => {
  it('defaults to devicebasedauth.org and accepts only https, or localhost in local mode', () => {
    expect(dbaIssuer({})).toBe('https://devicebasedauth.org');
    expect(dbaIssuer({ DBA_ISSUER: 'https://dba.example.com' })).toBe('https://dba.example.com');
    expect(dbaIssuer({ DBA_ISSUER: 'http://localhost:8788', ENVIRONMENT: 'local' })).toBe('http://localhost:8788');
    expect(dbaIssuer({ DBA_ISSUER: 'http://localhost:8788', ENVIRONMENT: 'production' })).toBeNull();
    expect(dbaIssuer({ DBA_ISSUER: 'http://dba.example.com', ENVIRONMENT: 'local' })).toBeNull();
    expect(dbaIssuer({ DBA_ISSUER: 'https://dba.example.com/path' })).toBeNull();
  });
});
