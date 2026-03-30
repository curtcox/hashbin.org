import { describe, expect, it, vi } from 'vitest';
import { HashBinClient } from './hashbin.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

describe('HashBin browser SDK', () => {
  it('creates an authorization request and stores PKCE transaction state', async () => {
    const storage = createMemoryStorage();
    const transactionStorage = createMemoryStorage();
    const client = new HashBinClient({
      clientId: 'app_123',
      redirectUri: 'https://example.com/callback',
      baseUrl: 'https://hashbin.test',
      storage,
      transactionStorage
    });

    const result = await client.authorize({
      scopes: ['content:write', 'balance:read'],
      state: 'state_123',
      mode: 'manual'
    });

    expect(result.url).toContain('https://hashbin.test/oauth/authorize?');
    expect(result.url).toContain('client_id=app_123');
    expect(result.url).toContain('state=state_123');
    expect(transactionStorage.getItem('hashbin:pkce:app_123:state_123')).toBeTruthy();
  });

  it('handles callback exchange and stores tokens', async () => {
    const storage = createMemoryStorage();
    const transactionStorage = createMemoryStorage();
    transactionStorage.setItem('hashbin:pkce:app_123:state_123', JSON.stringify({
      codeVerifier: 'verifier_123',
      redirectUri: 'https://example.com/callback'
    }));

    const fetchMock = vi.fn(async (url, options) => {
      expect(url).toBe('https://hashbin.test/oauth/token');
      const body = JSON.parse(options.body);
      expect(body.code_verifier).toBe('verifier_123');
      return new Response(JSON.stringify({
        access_token: 'access_123',
        refresh_token: 'refresh_123',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'content:write balance:read'
      }), {
        headers: { 'content-type': 'application/json' }
      });
    });

    const client = new HashBinClient({
      clientId: 'app_123',
      redirectUri: 'https://example.com/callback',
      baseUrl: 'https://hashbin.test',
      fetch: fetchMock,
      storage,
      transactionStorage
    });

    const tokens = await client.handleCallback({
      search: '?code=code_123&state=state_123'
    });

    expect(tokens.accessToken).toBe('access_123');
    expect(client.getTokens().refreshToken).toBe('refresh_123');
    expect(transactionStorage.getItem('hashbin:pkce:app_123:state_123')).toBeNull();
  });
});
