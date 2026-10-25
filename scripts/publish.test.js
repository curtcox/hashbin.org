import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  REDIRECT_PORT,
  REDIRECT_URI,
  authorize,
  buildAuthorizeUrl,
  createPkcePair,
  getAccessToken,
  keychainService,
  mimeTypeFor,
  parseArgs,
  publishFile,
  waitForCallback,
} from './publish.mjs';

function memoryKeychain(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    read: (service, account) => items.get(`${service}|${account}`) ?? null,
    store: (service, account, secret) => items.set(`${service}|${account}`, secret),
    delete: (service, account) => items.delete(`${service}|${account}`),
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const baseUrl = 'https://hashbin.org';
const clientId = 'app_test';
const service = keychainService(baseUrl);

describe('publish script', () => {
  it('builds a PKCE authorize URL with both scopes and the spending limit', () => {
    const { verifier, challenge } = createPkcePair();
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    const url = new URL(buildAuthorizeUrl({ baseUrl, clientId, challenge, state: 's1', spendingLimit: 5 }));
    expect(url.pathname).toBe('/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'content:write balance:read',
      state: 's1',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      spending_limit: '5',
    });
  });

  it('keeps grants for different hosts in different Keychain items', () => {
    expect(keychainService('https://hashbin.org')).toBe('hashbin-publish:hashbin.org');
    expect(keychainService('http://localhost:8787')).toBe('hashbin-publish:localhost:8787');
  });

  it('parses commands, positional arguments, and options', () => {
    expect(parseArgs(['publish', 'a.org', '--type', 'text/plain'])).toEqual({
      command: 'publish',
      options: { _: ['a.org'], type: 'text/plain' },
    });
    expect(mimeTypeFor('model.ORG')).toBe('text/plain');
    expect(mimeTypeFor('x.unknown')).toBe('application/octet-stream');
  });

  it('saves the rotated refresh token before using the access token', async () => {
    const keychain = memoryKeychain({ [`${service}|${clientId}`]: 'hbr_old' });
    const fetchImpl = async (url, init) => {
      expect(url).toBe('https://hashbin.org/oauth/token');
      expect(JSON.parse(init.body)).toEqual({ grant_type: 'refresh_token', refresh_token: 'hbr_old', client_id: clientId });
      return jsonResponse({ access_token: 'at', refresh_token: 'hbr_new' });
    };
    expect(await getAccessToken({ baseUrl, clientId, fetchImpl, keychain })).toBe('at');
    expect(keychain.read(service, clientId)).toBe('hbr_new');
  });

  it('asks for authorization when no grant is stored', async () => {
    await expect(getAccessToken({ baseUrl, clientId, fetchImpl: fetch, keychain: memoryKeychain() }))
      .rejects.toThrow(/authorize/);
  });

  it('uploads the file bytes with a bearer token and its content type', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-'));
    const file = join(dir, 'model.org');
    await writeFile(file, '* Model\n');
    const keychain = memoryKeychain({ [`${service}|${clientId}`]: 'hbr_old' });
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/oauth/token')) return jsonResponse({ access_token: 'at', refresh_token: 'hbr_new' });
      return jsonResponse({ cid: 'cid1', cost_cents: 1 }, 201);
    };
    expect(await publishFile({ baseUrl, clientId, file, fetchImpl, keychain })).toEqual({ cid: 'cid1', cost_cents: 1 });
    const upload = calls[1];
    expect(upload.url).toBe('https://hashbin.org/api/content');
    expect(upload.init.headers).toEqual({ authorization: 'Bearer at', 'content-type': 'text/plain' });
    expect(Buffer.from(upload.init.body).toString()).toBe('* Model\n');
  });

  it('reports the server error when an upload is refused', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-'));
    const file = join(dir, 'a.txt');
    await writeFile(file, 'x'.repeat(100));
    const keychain = memoryKeychain({ [`${service}|${clientId}`]: 'hbr_old' });
    const fetchImpl = async (url) => url.endsWith('/oauth/token')
      ? jsonResponse({ access_token: 'at', refresh_token: 'hbr_new' })
      : jsonResponse({ error: 'spending_limit_exceeded', message: 'This app would exceed its monthly spending limit' }, 400);
    await expect(publishFile({ baseUrl, clientId, file, fetchImpl, keychain }))
      .rejects.toThrow(/spending_limit_exceeded/);
  });

  it('rejects a callback whose state does not match', async () => {
    const port = REDIRECT_PORT + 101;
    const rejected = expect(waitForCallback({ state: 'expected', port, timeoutMs: 5000 }))
      .rejects.toThrow(/state mismatch/);
    const response = await fetch(`http://127.0.0.1:${port}/callback?code=c&state=other`);
    expect(response.status).toBe(400);
    await rejected;
  });

  it('completes authorization through the loopback callback and stores the refresh token', async () => {
    const keychain = memoryKeychain();
    let tokenRequest;
    const fetchImpl = async (url, init) => {
      tokenRequest = JSON.parse(init.body);
      return jsonResponse({ access_token: 'at', refresh_token: 'hbr_first', scope: 'content:write balance:read' });
    };
    // Stand in for the browser: approve by following the redirect with the same state.
    const port = REDIRECT_PORT + 100;
    const openUrl = (url) => {
      const params = new URL(url).searchParams;
      setTimeout(() => fetch(`${params.get('redirect_uri')}?code=the-code&state=${params.get('state')}`), 10);
    };
    const result = await authorize({ baseUrl, clientId, spendingLimit: 2, fetchImpl, keychain, openUrl, log: () => {}, port });
    expect(result.scope).toBe('content:write balance:read');
    expect(tokenRequest).toMatchObject({ grant_type: 'authorization_code', code: 'the-code', redirect_uri: `http://127.0.0.1:${port}/callback`, client_id: clientId });
    expect(tokenRequest.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(keychain.read(service, clientId)).toBe('hbr_first');
  });
});
