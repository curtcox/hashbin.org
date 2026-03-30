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

import { handleGetBalance, handleGetBalanceHistory } from './balance.js';
import { handleGetUserUploads } from './user.js';
import { handleExtendContent } from './content.js';

function createDurableObjectBinding(fetchHandler) {
  return {
    idFromName: (name) => ({ toString: () => name }),
    get: () => ({
      fetch: fetchHandler
    })
  };
}

describe('OAuth scope enforcement', () => {
  it('rejects balance reads without balance:read scope', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      error: null,
      user: {
        userId: 'oauth_user',
        authMethod: 'oauth',
        oauth: {
          scopes: ['content:write'],
          appId: 'app_1',
          grantId: 'grant_1'
        }
      }
    });

    const response = await handleGetBalance(new Request('https://hashbin.test/api/balance', {
      headers: { authorization: 'Bearer token' }
    }), {
      USER_PROFILES: createDurableObjectBinding(async () => new Response('{}'))
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('insufficient_scope');
  });

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

  it('blocks oauth tokens from balance history and user uploads', async () => {
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

    const balanceHistoryResponse = await handleGetBalanceHistory(new Request('https://hashbin.test/api/balance/history', {
      headers: { authorization: 'Bearer token' }
    }), {
      PAYMENT_RECORDS: createDurableObjectBinding(async () => new Response('{}'))
    });
    expect(balanceHistoryResponse.status).toBe(403);

    const uploadsResponse = await handleGetUserUploads(new Request('https://hashbin.test/api/user/uploads', {
      headers: { authorization: 'Bearer token' }
    }), {
      USER_PROFILES: createDurableObjectBinding(async () => new Response('{}')),
      CONTENT_METADATA: createDurableObjectBinding(async () => new Response('{}'))
    });
    expect(uploadsResponse.status).toBe(403);
  });

  it('blocks oauth tokens from retention extension', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      error: null,
      user: {
        userId: 'oauth_user',
        authMethod: 'oauth',
        oauth: {
          scopes: ['content:write'],
          appId: 'app_1',
          grantId: 'grant_1'
        }
      }
    });

    const response = await handleExtendContent(new Request('https://hashbin.test/api/content/cid/extend', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ months_to_add: 1 })
    }), {
      USER_PROFILES: createDurableObjectBinding(async () => new Response('{}')),
      CONTENT_METADATA: createDurableObjectBinding(async () => new Response('{}')),
      PAYMENT_RECORDS: createDurableObjectBinding(async () => new Response('{}'))
    }, 'cid_123');

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('insufficient_scope');
  });
});
