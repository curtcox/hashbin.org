import { describe, expect, it, vi } from 'vitest';

const { authenticateMock } = vi.hoisted(() => ({ authenticateMock: vi.fn() }));
vi.mock('../auth/middleware.js', async () => ({
  ...(await vi.importActual('../auth/middleware.js')),
  authenticate: authenticateMock
}));

import { handleExtendContent, handleUploadContent } from './content.js';

authenticateMock.mockResolvedValue({
  authenticated: true,
  user: { userId: 'user_1', authMethod: 'clerk', profile: { user_id: 'user_1' } }
});

function envForDeletedContent() {
  const debit = vi.fn();
  return {
    debit,
    env: {
      USER_PROFILES: {
        idFromName: n => n,
        get: () => ({
          fetch: async request => {
            if (new URL(request.url).pathname === '/balance/debit') debit();
            return Response.json({ balance_cents: 10000 });
          }
        })
      },
      CONTENT_METADATA: {
        idFromName: n => n,
        get: () => ({
          fetch: async request => {
            const { pathname } = new URL(request.url);
            if (pathname === '/exists') return Response.json({ exists: true, deleted: true, size_bytes: 5000 });
            if (pathname === '/content') return Response.json({ size_bytes: 5000, deleted_at: '2026-10-01T00:00:00Z' });
            return new Response('unexpected', { status: 500 });
          }
        })
      }
    }
  };
}

describe('deleted content', () => {
  it('refuses re-uploads without charging', async () => {
    const { env, debit } = envForDeletedContent();
    const request = new Request('https://hashbin.test/api/content', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(5000)
    });

    const response = await handleUploadContent(request, env);
    expect(response.status).toBe(410);
    expect(debit).not.toHaveBeenCalled();
  });

  it('refuses extensions without charging', async () => {
    const { env, debit } = envForDeletedContent();
    const request = new Request('https://hashbin.test/api/content/x/extend', {
      method: 'POST',
      body: JSON.stringify({ months_to_add: 3 })
    });

    const response = await handleExtendContent(request, env, 'AAAAAAAAcid');
    expect(response.status).toBe(410);
    expect(debit).not.toHaveBeenCalled();
  });
});
