/**
 * A fake devicebasedauth.org for HashBin's DBA tests. Its key signs credentials, status lists,
 * ID tokens and webhook events with the vendored issuer helpers, and a stubbed fetch serves its
 * JWKS, status list, hashbin.org catalog, OIDC endpoints and online /api/v1/authorize.
 *
 *   let t;
 *   beforeEach(async () => { t = await setupDba(); });
 *   const response = await t.call(await t.dbaRequest(await t.issue([{ actions: ['hashbin:balance:read'] }])));
 */

import { vi } from 'vitest';
import worker from '../src/index.js';
import { memoryState } from './alias-fixture.js';
import { UserProfile } from '../src/durable-objects/user-profile.js';
import { DbaLink } from '../src/durable-objects/dba-link.js';
import { DbaRevocations } from '../src/durable-objects/dba-revocations.js';
import { ApplicationRegistry } from '../src/durable-objects/application-registry.js';
import { ReplayCacheDO } from '../src/vendor/devicebasedauth/replay-do.js';
import { resetDbaAuth } from '../src/auth/dba.js';
import { forgetPushedDbaRevocations } from '../src/auth/dba-auth.js';
import { issuerSigner, jwksFor, signCredential, signStatusList } from '../src/vendor/devicebasedauth/issuer.js';
import { createProof } from '../src/vendor/devicebasedauth/credential.js';
import { exportPublicJwk, generateKeyPair, jwkThumbprint, signJws } from '../src/vendor/devicebasedauth/jose.js';

export const ISSUER = 'https://dba.test';
export const ORIGIN = 'http://localhost:8787';
export const STATUS_URI = `${ISSUER}/status/1`;
export const DBA_ACCOUNT = 'alice_dba';
export const now = () => Math.floor(Date.now() / 1000);

/** A Durable Object namespace of in-memory objects. Stubs accept fetch(url, init) like Workers'. */
export function namespace(Class, getEnv) {
  const objects = new Map();
  const stubs = new Map();
  return {
    idFromName: name => name,
    get: name => {
      if (!objects.has(name)) {
        const object = new Class(memoryState(), getEnv());
        objects.set(name, object);
        stubs.set(name, new Proxy(object, {
          get: (target, prop) => prop === 'fetch'
            ? (input, init) => target.fetch(input instanceof Request ? input : new Request(input, init))
            : target[prop]
        }));
      }
      return stubs.get(name);
    },
    objects
  };
}

export async function newIssuerKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { kid: 'test-1', jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

export async function newDevice() {
  const pair = await generateKeyPair(true);
  const publicJwk = await exportPublicJwk(pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk, jkt: await jwkThumbprint(publicJwk) };
}

/**
 * Fresh fake DBA, Worker env and device. Options: { env } merged into the env.
 * `t.online` controls the fake /api/v1/authorize: set `t.online.answer` to a body
 * ({ allow: true, … } or { allow: false, code: 'gate_pending', … }); calls are in `t.online.calls`.
 */
export async function setupDba(options = {}) {
  resetDbaAuth();
  forgetPushedDbaRevocations();
  const t = {
    issuerKey: await newIssuerKey(),
    device: await newDevice(),
    statusBytes: new Uint8Array(16),
    oidc: { tokenRequests: [], nonce: null, account: DBA_ACCOUNT },
    catalog: [],
    online: { answer: { allow: true }, calls: [] },
    fetchCalls: []
  };
  t.signer = await issuerSigner(t.issuerKey);
  t.env = { ENVIRONMENT: 'local', DBA_ISSUER: ISSUER, ...options.env };
  const getEnv = () => t.env;
  t.env.USER_PROFILES = namespace(UserProfile, getEnv);
  t.env.DBA_LINKS = namespace(DbaLink, getEnv);
  t.env.DBA_REVOCATIONS = namespace(DbaRevocations, getEnv);
  t.env.DBA_REPLAY = namespace(ReplayCacheDO, getEnv);
  t.env.APPLICATION_REGISTRY = namespace(ApplicationRegistry, getEnv);

  t.credentialPayload = (grants, overrides = {}) => {
    const at = now();
    return {
      iss: ISSUER, sub: 'dev_LAPTOP0001', acct: DBA_ACCOUNT, aud: ['hashbin.org'],
      cid: 'crd_CRED000001', jti: 'crd_CRED000001.1', iat: at, nbf: at, exp: at + 3600,
      cnf: { jkt: t.device.jkt }, grants, status: { status_list: { idx: 5, uri: STATUS_URI } }, ver: 1,
      ...overrides
    };
  };
  t.issue = (grants, overrides) => signCredential(t.credentialPayload(grants, overrides), t.signer);

  t.dbaRequest = async (credential, { method = 'GET', path = '/api/balance', proof = true, body, headers = {} } = {}) => {
    const url = `${ORIGIN}${path}`;
    const all = { Authorization: `DBA ${credential}`, ...headers };
    if (proof === true) all.DPoP = await createProof({ privateKey: t.device.privateKey, publicJwk: t.device.publicJwk, method, url, credential });
    else if (proof) all.DPoP = proof;
    return new Request(url, { method, headers: all, ...(body ? { body: JSON.stringify(body) } : {}) });
  };
  t.session = (path, init = {}, user = 'alice') => new Request(`${ORIGIN}${path}`, {
    ...init, headers: { Authorization: `LocalDev ${user}`, 'content-type': 'application/json', ...(init.headers || {}) }
  });
  t.call = request => worker.fetch(request, t.env, {});

  /** Sign a webhook event (spec/events.md) with the issuer key. */
  t.signEvent = (payload, signer = t.signer) => signJws({ typ: 'dba-event+jwt', kid: t.issuerKey.kid },
    { iss: ISSUER, aud: 'hashbin.org', iat: now(), jti: `evt_${crypto.randomUUID()}`, ...payload }, signer.key);

  t.fetch = vi.fn(async (input, init = {}) => {
    const url = String(input);
    t.fetchCalls.push(url);
    if (url === `${ISSUER}/.well-known/jwks.json`) return Response.json(jwksFor([t.issuerKey]));
    if (url === STATUS_URI) return new Response(await signStatusList({ uri: STATUS_URI, bytes: t.statusBytes, issuer: ISSUER }, t.signer));
    if (url === `${ISSUER}/api/v1/audiences/hashbin.org`) return Response.json({ name: 'hashbin.org', namespace: 'hashbin', catalog: t.catalog });
    if (url === `${ISSUER}/api/v1/authorize`) {
      t.online.calls.push({ ...JSON.parse(init.body), authorization: init.headers?.Authorization });
      return Response.json(t.online.answer, { status: t.online.status || 200 });
    }
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Response.json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/oauth/authorize`, token_endpoint: `${ISSUER}/oauth/token`, jwks_uri: `${ISSUER}/.well-known/jwks.json` });
    }
    if (url === `${ISSUER}/oauth/token`) {
      const form = new URLSearchParams(init.body);
      t.oidc.tokenRequests.push(Object.fromEntries(form));
      if (form.get('code') !== 'good-code') return Response.json({ error: 'invalid_grant', error_description: 'Unknown code' }, { status: 400 });
      const at = now();
      const idToken = await signJws({ typ: 'JWT', kid: t.issuerKey.kid }, { iss: ISSUER, aud: 'hashbin.org', sub: t.oidc.account, acct: t.oidc.account, nonce: t.oidc.nonce, iat: at, exp: at + 300 }, t.signer.key);
      return Response.json({ id_token: idToken, token_type: 'Bearer' });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', t.fetch);

  /** Run the link flow as `user` for DBA account `account`; returns the finish response. */
  t.link = async (user = 'alice', account = DBA_ACCOUNT) => {
    const started = await t.call(t.session('/api/auth/dba/link/start', { method: 'POST' }, user));
    if (started.status !== 200) throw new Error(`link start answered ${started.status}`);
    const authorize = new URL((await started.json()).url);
    t.oidc.nonce = authorize.searchParams.get('nonce');
    t.oidc.account = account;
    return t.call(t.session('/api/auth/dba/link/finish', { method: 'POST', body: JSON.stringify({ code: 'good-code', state: authorize.searchParams.get('state') }) }, user));
  };
  return t;
}
