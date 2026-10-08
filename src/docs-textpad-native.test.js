import { beforeEach, describe, expect, it, vi } from 'vitest';
import { secureStore } from '../test-utils/expo-stubs.js';
import { generate256tHash } from './utils/hash256t.js';
import {
  cidFromText,
  decodeText,
  inlineBytes,
  isValid256t,
  queryParams
} from '../examples/textpad-expo/textpad.js';
// vitest.config.js swaps the Expo modules for test-utils/expo-stubs.js.
import { HashBinAccount, NotConnectedError } from '../examples/textpad-expo/hashbin.js';

describe('Expo Textpad 256t handling', () => {
  it('accepts 256t strings for empty, inline and hashed content', async () => {
    for (const size of [0, 1, 2, 3, 63, 64, 65, 1000]) {
      expect(isValid256t(await generate256tHash(new Uint8Array(size).fill(65))), `size ${size}`).toBe(true);
    }
  });

  it('rejects malformed and truncated 256t strings', async () => {
    const inline = await generate256tHash(new TextEncoder().encode('Hello from Textpad!'));
    expect(isValid256t('not-a-real-256t-string')).toBe(false);
    expect(isValid256t('abc%zz')).toBe(false);
    expect(isValid256t(inline.slice(0, -1))).toBe(false);
    expect(isValid256t(`${inline}A`)).toBe(false);
  });

  it('reads inline text, keeps a byte order mark, and refuses binary data', async () => {
    const text = 'Hello from Textpad! é 中 😀';
    expect(decodeText(inlineBytes(await generate256tHash(new TextEncoder().encode(text))))).toBe(text);
    expect(inlineBytes(await generate256tHash(new Uint8Array(65)))).toBeNull();

    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    expect(new TextEncoder().encode(decodeText(withBom))).toEqual(withBom);

    expect(() => decodeText(new Uint8Array([0xff, 0xfe, 0x00, 0x01]))).toThrow();
    expect(() => decodeText(new Uint8Array([0xed, 0xa0, 0x80]))).toThrow(); // A UTF-16 surrogate
    expect(() => decodeText(new TextEncoder().encode('binary\0data'))).toThrow();
  });

  it('finds the 256t string in links', () => {
    const cid = 'AAAAAAAFaGVsbG8';
    expect(cidFromText(`org.hashbin.textpad.expo://open?256t=${cid}`)).toBe(cid);
    expect(cidFromText(`https://hashbin.org/docs/textpad/app#256t=${cid}`)).toBe(cid);
    expect(cidFromText(`https://256t.us/${cid}`)).toBe(cid);
    expect(cidFromText(`  ${cid}\n`)).toBe(cid);
    expect(cidFromText('org.hashbin.textpad.expo://open?256t=')).toBe('');
    expect(cidFromText('org.hashbin.textpad.expo://open?256t=abc%zz')).toBe('abc%zz');
    expect(cidFromText('org.hashbin.textpad.expo://oauth?code=x&state=y')).toBeNull();
  });

  it('reads the parameters HashBin adds to the sign-in redirect', () => {
    expect(queryParams('org.hashbin.textpad.expo://oauth?code=a%2Bb&state=s1')).toEqual({ code: 'a+b', state: 's1' });
    expect(queryParams('org.hashbin.textpad.expo://oauth?error=access_denied&state=s1#x')).toEqual({ error: 'access_denied', state: 's1' });
  });
});

describe('Expo Textpad HashBin client', () => {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  async function expiredAccount(server) {
    secureStore.clear();
    secureStore.set('hashbin.tokens', JSON.stringify({ accessToken: 'old', refreshToken: 'refresh-1', expiresAt: 0 }));
    vi.stubGlobal('fetch', vi.fn(server));
    const account = new HashBinAccount({
      clientId: 'app_test',
      redirectUri: 'org.example.textpad://oauth',
      baseUrl: 'https://hashbin.test',
      scopes: ['content:write']
    });
    await account.load();
    return account;
  }

  beforeEach(() => vi.unstubAllGlobals());

  it('renews an expired access token once for simultaneous requests', async () => {
    let tokenCalls = 0;
    const account = await expiredAccount(async (url, options) => {
      if (url.endsWith('/oauth/token')) {
        tokenCalls++;
        expect(JSON.parse(options.body).refresh_token).toBe('refresh-1');
        return json({ access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 });
      }
      expect(options.headers.authorization).toBe('Bearer new');
      return json({ balance_cents: 500 });
    });

    const responses = await Promise.all([1, 2, 3].map(() => account.fetch('/api/balance')));
    expect(tokenCalls).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(JSON.parse(secureStore.get('hashbin.tokens')).refreshToken).toBe('refresh-2');
  });

  it('forgets the tokens when HashBin refuses the refresh token', async () => {
    const account = await expiredAccount(async () => json({ error: 'invalid_grant' }, 400));
    await expect(account.fetch('/api/balance')).rejects.toBeInstanceOf(NotConnectedError);
    expect(account.isConnected()).toBe(false);
    expect(secureStore.has('hashbin.tokens')).toBe(false);
  });

  it('forgets the tokens when the API answers 401', async () => {
    const account = await expiredAccount(async (url) => url.endsWith('/oauth/token')
      ? json({ access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 })
      : json({ error: 'unauthorized' }, 401));
    await expect(account.fetch('/api/balance')).rejects.toBeInstanceOf(NotConnectedError);
    expect(account.isConnected()).toBe(false);
  });
});
