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

import { handleUploadContent } from './content.js';

function createDurableObjectBinding(fetchHandler) {
  return {
    idFromName: (name) => ({ toString: () => name }),
    get: () => ({
      fetch: fetchHandler
    })
  };
}

describe('Content API third-party publishing', () => {
  it('uses the user default retention for oauth publishing and ignores caller-supplied retention', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      error: null,
      user: {
        userId: 'oauth_user',
        authMethod: 'oauth',
        profile: {
          user_id: 'oauth_user',
          balance_cents: 2500,
          default_retention_months: 6
        },
        oauth: {
          scopes: ['content:write'],
          appId: 'app_123',
          grantId: 'grant_123'
        }
      }
    });

    let recordedMetadataBody = null;
    let debitBody = null;

    const env = {
      USER_PROFILES: createDurableObjectBinding(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/balance') {
          return new Response(JSON.stringify({ balance_cents: 2500 }), {
            headers: { 'content-type': 'application/json' }
          });
        }
        if (url.pathname === '/balance/debit') {
          debitBody = await request.json();
          return new Response(JSON.stringify({
            amount_cents: debitBody.amount_cents,
            balance_before_cents: 2500,
            balance_after_cents: 2000
          }), {
            headers: { 'content-type': 'application/json' }
          });
        }
        if (url.pathname === '/uploads') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' }
          });
        }
        return new Response('not found', { status: 404 });
      }),
      CONTENT_METADATA: createDurableObjectBinding(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/exists') {
          return new Response(JSON.stringify({ exists: false }), {
            headers: { 'content-type': 'application/json' }
          });
        }
        if (url.pathname === '/content') {
          recordedMetadataBody = await request.json();
          return new Response(JSON.stringify({
            hash_256t: recordedMetadataBody.hash_256t,
            expires_at: new Date(Date.now() + 86400000).toISOString()
          }), {
            headers: { 'content-type': 'application/json' }
          });
        }
        return new Response('not found', { status: 404 });
      }),
      PAYMENT_RECORDS: createDurableObjectBinding(async () => new Response('{}', {
        headers: { 'content-type': 'application/json' }
      })),
      PLATFORM_STATS: createDurableObjectBinding(async () => new Response('{}', {
        headers: { 'content-type': 'application/json' }
      })),
      EXPIRATION_INDEX: createDurableObjectBinding(async () => new Response('{}', {
        headers: { 'content-type': 'application/json' }
      })),
      CONTENT_BUCKET: {
        put: vi.fn(async () => undefined)
      }
    };

    const request = new Request('https://hashbin.test/api/content?retention_months=24', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        authorization: 'Bearer oauth-token'
      },
      body: new Uint8Array([1, 2, 3])
    });

    const response = await handleUploadContent(request, env);

    expect(response.status).toBe(201);
    expect(recordedMetadataBody.retention_months).toBe(6);
    expect(debitBody).toBeNull();
  });

  it('rejects oauth uploads when the token lacks content:write scope', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      error: null,
      user: {
        userId: 'oauth_user',
        authMethod: 'oauth',
        profile: {
          user_id: 'oauth_user',
          balance_cents: 2500,
          default_retention_months: 6
        },
        oauth: {
          scopes: ['balance:read'],
          appId: 'app_123',
          grantId: 'grant_123'
        }
      }
    });

    const env = {
      USER_PROFILES: createDurableObjectBinding(async () => new Response('{}')),
      CONTENT_METADATA: createDurableObjectBinding(async () => new Response('{}')),
      PAYMENT_RECORDS: createDurableObjectBinding(async () => new Response('{}')),
      PLATFORM_STATS: createDurableObjectBinding(async () => new Response('{}')),
      EXPIRATION_INDEX: createDurableObjectBinding(async () => new Response('{}')),
      CONTENT_BUCKET: {
        put: vi.fn(async () => undefined)
      }
    };

    const request = new Request('https://hashbin.test/api/content', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        authorization: 'Bearer oauth-token'
      },
      body: new Uint8Array([1, 2, 3])
    });

    const response = await handleUploadContent(request, env);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('insufficient_scope');
  });
});
