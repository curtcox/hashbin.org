/**
 * devicebasedauth.org device sessions, online decisions, catalog gate policies, the revocation
 * webhook and the shared replay cache, through the Worker with the fake DBA in
 * test-utils/dba-fixture.js.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from './middleware.js';
import { resetDbaAuth } from './dba.js';
import { ALL_USER_SCOPES, spenderOf } from './scopes.js';
import { issuerSigner } from '../vendor/devicebasedauth/issuer.js';
import { createProof } from '../vendor/devicebasedauth/credential.js';
import { ORIGIN, STATUS_URI, newIssuerKey, now, setupDba } from '../../test-utils/dba-fixture.js';

let t;
beforeEach(async () => {
  t = await setupDba();
  expect((await t.link('alice')).status).toBe(200);
});
afterEach(() => vi.unstubAllGlobals());

const body = async response => ({ status: response.status, ...(await response.json()) });

describe('device sessions (hashbin:session)', () => {
  it('act as the session with every user scope, but spend as the credential', async () => {
    const credential = await t.issue([{ actions: ['hashbin:session'], limits: { spend_usd_per_month: 2 } }]);
    const auth = await authenticate(await t.dbaRequest(credential), t.env);
    expect(auth.user).toMatchObject({ authMethod: 'dba', session: true, deviceSession: true, caveats: { monthly_spend_limit_cents: 200 } });
    expect(auth.user.scopes).toEqual(ALL_USER_SCOPES.filter(scope => scope !== 'downloads:spend'));
    expect(spenderOf(auth)).toMatchObject({ kind: 'dba', id: 'crd_CRED000001', caveats: { monthly_spend_limit_cents: 200 } });
  });

  it('reach session routes but never ones that mint credentials or end the account', async () => {
    const credential = await t.issue([{ actions: ['hashbin:session'] }]);
    for (const path of ['/api/auth/apikeys', '/api/account/settings', '/api/account/authorizations', '/api/balance']) {
      expect((await t.call(await t.dbaRequest(credential, { path }))).status, path).toBe(200);
    }
    for (const [method, path] of [['POST', '/api/auth/apikeys'], ['DELETE', '/api/auth/account'], ['POST', '/api/developers/apps'], ['POST', '/oauth/authorize'], ['POST', '/api/admin/keys']]) {
      const response = await t.call(await t.dbaRequest(credential, { method, path, body: {} }));
      expect(response.status, `${method} ${path}`).toBe(403);
      expect((await response.json()).error).toBe('session_required');
    }
  });

  it('end when the device is revoked', async () => {
    const credential = await t.issue([{ actions: ['hashbin:session'] }]);
    expect((await t.call(await t.dbaRequest(credential, { path: '/api/auth/apikeys' }))).status).toBe(200);
    t.statusBytes[0] = 1 << 5;
    resetDbaAuth(); // the status list cache would otherwise hold the old list for its TTL
    expect((await t.call(await t.dbaRequest(credential, { path: '/api/auth/apikeys' }))).status).toBe(401);
  });
});

describe('grants that need an online decision', () => {
  const onlineGrant = [{ actions: ['hashbin:balance:read'], require: { online: true } }];

  it('answer 403 online_required when DBA_API_KEY is not set, without calling DBA', async () => {
    const credential = await t.issue(onlineGrant);
    const auth = await authenticate(await t.dbaRequest(credential), t.env);
    expect(auth.user.scopes).toEqual([]);
    expect(auth.user.dba.onlineScopes).toEqual(['balance:read']);
    expect(await body(await t.call(await t.dbaRequest(credential)))).toMatchObject({ status: 403, error: 'online_required' });
    expect(t.online.calls).toHaveLength(0);
  });

  it('ask DBA for the route\'s scope with the operator key, and honour its answer', async () => {
    t.env.DBA_API_KEY = 'dba_operator_key';
    const credential = await t.issue(onlineGrant);
    t.online.answer = { allow: true, caveats: { spend_usd_per_month: 1 } };
    const allowed = await t.call(await t.dbaRequest(credential));
    expect(allowed.status).toBe(200);
    expect(t.online.calls[0]).toMatchObject({ action: 'hashbin:balance:read', audience: 'hashbin.org', credential, authorization: 'ApiKey dba_operator_key',
      request: { method: 'GET', url: `${ORIGIN}/api/balance` } });

    t.online.answer = { allow: false, code: 'forbidden', reasons: ['step_up_denied'] };
    expect(await body(await t.call(await t.dbaRequest(credential)))).toMatchObject({ status: 403, error: 'dba_denied', reasons: ['step_up_denied'] });
  });

  it('answer gate_pending with DBA\'s gate request while gates are open', async () => {
    t.env.DBA_API_KEY = 'dba_operator_key';
    const credential = await t.issue([{ actions: ['hashbin:balance:read'], require: { step_up: true } }]);
    const gateRequest = { id: 'gtr_1', retry_after: 2, deadline: now() + 600 };
    t.online.answer = { allow: false, code: 'gate_pending', gate_request: gateRequest };
    expect(await body(await t.call(await t.dbaRequest(credential)))).toMatchObject({ status: 403, code: 'gate_pending', gate_request: gateRequest });
  });

  it('only go online for a scope the route needs', async () => {
    t.env.DBA_API_KEY = 'dba_operator_key';
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }, { actions: ['hashbin:content:write'], require: { online: true } }]);
    expect((await t.call(await t.dbaRequest(credential))).status).toBe(200);
    expect(t.online.calls).toHaveLength(0);
  });

  it('can make a device session online', async () => {
    t.env.DBA_API_KEY = 'dba_operator_key';
    const credential = await t.issue([{ actions: ['hashbin:session'], require: { online: true } }]);
    expect((await t.call(await t.dbaRequest(credential, { path: '/api/account/settings' }))).status).toBe(200);
    expect(t.online.calls[0].action).toBe('hashbin:session');
  });

  it('follow the hashbin.org catalog: an action whose policy requires gates goes online', async () => {
    t.catalog = [{ action: 'hashbin:balance:read', gates: { require: true } }];
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    expect(await body(await t.call(await t.dbaRequest(credential)))).toMatchObject({ status: 403, error: 'online_required' });
  });

  it('fail closed when the catalog cannot be loaded', async () => {
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    const fake = t.fetch.getMockImplementation();
    vi.stubGlobal('fetch', vi.fn(async (input, init) => String(input).includes('/api/v1/audiences/') ? new Response('down', { status: 502 }) : fake(input, init)));
    expect(await body(await t.call(await t.dbaRequest(credential)))).toMatchObject({ status: 503, error: 'AUTH_DBA_UNAVAILABLE', dba_code: 'catalog_unavailable' });
  });
});

describe('the revocation webhook', () => {
  const revokedEvent = (exp = now() + 3600) => t.signEvent({ type: 'credentials.revoked',
    credentials: [{ cid: 'crd_CRED000001', jti: 'crd_CRED000001.1', exp, revoked_at: now(), status: { idx: 5, uri: STATUS_URI } }] });
  const post = async jws => t.call(new Request(`${ORIGIN}/api/dba/events`, { method: 'POST', headers: { 'content-type': 'application/jwt' }, body: jws }));

  it('stops a revoked credential in every isolate before the status list says so', async () => {
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    expect((await t.call(await t.dbaRequest(credential))).status).toBe(200);
    expect((await post(await revokedEvent())).status).toBe(204);
    expect(await body(await t.call(await t.dbaRequest(credential)))).toMatchObject({ status: 401, error: 'AUTH_KEY_REVOKED', dba_code: 'revoked' });
    resetDbaAuth(); // another isolate: its verifier never saw the event
    expect((await t.call(await t.dbaRequest(credential))).status).toBe(401);
    expect(t.statusBytes[0]).toBe(0);
  });

  it('refuses events DBA did not sign, and accepts webhook tests', async () => {
    const forger = await issuerSigner(await newIssuerKey());
    expect(await body(await post(await t.signEvent({ type: 'credentials.revoked', credentials: [{ cid: 'x', exp: now() + 60, status: { idx: 5, uri: STATUS_URI } }] }, forger))))
      .toMatchObject({ status: 400, error: 'invalid_event', dba_code: 'invalid_signature' });
    expect((await post('not a jws')).status).toBe(400);
    expect((await post(await t.signEvent({ type: 'webhook.test' }))).status).toBe(204);
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    expect((await t.call(await t.dbaRequest(credential))).status).toBe(200);
  });

  it('forgets revocations once the credential has expired', async () => {
    await post(await revokedEvent(now() + 1));
    const revocations = t.env.DBA_REVOCATIONS.get('global');
    expect((await (await revocations.fetch('https://x/revoked')).json()).revoked).toHaveLength(1);
    vi.useFakeTimers({ now: Date.now() + 5000, toFake: ['Date'] });
    try {
      await revocations.alarm();
      expect((await (await revocations.fetch('https://x/revoked')).json()).revoked).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DPoP replay across isolates', () => {
  it('refuses a proof already used against another isolate', async () => {
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    const url = `${ORIGIN}/api/balance`;
    const proof = await createProof({ privateKey: t.device.privateKey, publicJwk: t.device.publicJwk, method: 'GET', url, credential });
    expect((await t.call(await t.dbaRequest(credential, { proof }))).status).toBe(200);
    resetDbaAuth(); // a fresh verifier has an empty in-isolate replay cache
    expect(await body(await t.call(await t.dbaRequest(credential, { proof })))).toMatchObject({ status: 401, dba_code: 'replayed_proof' });
  });
});

describe('CORS for device credentials', () => {
  const preflight = headers => t.call(new Request(`${ORIGIN}/api/balance`, { method: 'OPTIONS', headers: { Origin: 'https://any-app.example', 'Access-Control-Request-Method': 'GET', ...headers } }));

  it('lets any origin send a device credential and read the answer', async () => {
    const allowed = await preflight({ 'Access-Control-Request-Headers': 'authorization, dpop, dba-confirmation' });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://any-app.example');
    expect(allowed.headers.get('Access-Control-Allow-Headers')).toBe('authorization, content-type, dpop, dba-confirmation');
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBeNull();

    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    const response = await t.call(await t.dbaRequest(credential, { headers: { Origin: 'https://any-app.example' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://any-app.example');
    expect(response.headers.get('Vary')).toContain('Authorization');
  });

  it('keeps other credentials to registered origins', async () => {
    expect((await preflight({ 'Access-Control-Request-Headers': 'authorization' })).status).toBe(403);
    const keyCall = await t.call(new Request(`${ORIGIN}/api/balance`, { headers: { Origin: 'https://any-app.example', Authorization: 'LocalDev alice' } }));
    expect(keyCall.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const oauthPreflight = await t.call(new Request(`${ORIGIN}/oauth/token`, { method: 'OPTIONS', headers: { Origin: 'https://any-app.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'dpop' } }));
    expect(oauthPreflight.status).toBe(403);
  });
});
