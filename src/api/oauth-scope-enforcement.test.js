import { describe, expect, it, vi } from 'vitest';

const { authenticateMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn()
}));

vi.mock('../auth/middleware.js', async () => {
  const actual = await vi.importActual('../auth/middleware.js');
  return {
    ...actual,
    authenticate: authenticateMock
  };
});

import { handleGetBalance } from './balance.js';

function createDurableObjectBinding(fetchHandler) {
  return {
    idFromName: (name) => ({ toString: () => name }),
    get: () => ({
      fetch: fetchHandler
    })
  };
}

describe('OAuth scope enforcement', () => {

  it('allows balance reads with balance:read scope', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      error: null,
      user: {
        userId: 'oauth_user',
        authMethod: 'oauth',
        oauth: {
          scopes: ['balance:read'],
          appId: 'app_1',
          grantId: 'grant_1'
        }
      }
    });

    const response = await handleGetBalance(new Request('https://hashbin.test/api/balance', {
      headers: { authorization: 'Bearer token' }
    }), {
      USER_PROFILES: createDurableObjectBinding(async () => new Response(JSON.stringify({
        balance_cents: 1234
      }), {
        headers: { 'content-type': 'application/json' }
      }))
    });

    expect(response.status).toBe(200);
    expect((await response.json()).balance_cents).toBe(1234);
  });
});
