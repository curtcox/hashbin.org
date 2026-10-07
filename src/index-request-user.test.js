import { describe, expect, it, vi } from 'vitest';

const { authenticateMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn()
}));

vi.mock('./auth/middleware.js', async () => {
  const actual = await vi.importActual('./auth/middleware.js');
  return {
    ...actual,
    authenticate: authenticateMock,
    applyRateLimit: () => null
  };
});

import worker from './index.js';

// Content lookup returns 404, so reaching it proves the caller was recognized
const env = {
  CONTENT_METADATA: {
    idFromName: (name) => name,
    get: () => ({ fetch: async () => new Response('{}', { status: 404 }) })
  }
};

function deleteRequest() {
  return new Request('https://hashbin.test/api/content/AAAAAAAAabc', { method: 'DELETE' });
}

describe('request.user wiring', () => {
  it('lets a signed-in user reach the deletion handler', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      user: { userId: 'user_1', authMethod: 'clerk' }
    });

    const response = await worker.fetch(deleteRequest(), env, {});
    expect(response.status).toBe(404);
  });

  it('does not give OAuth tokens deletion rights', async () => {
    authenticateMock.mockResolvedValue({
      authenticated: true,
      user: { userId: 'user_1', authMethod: 'oauth', oauth: { scopes: ['content:write'] } }
    });

    const response = await worker.fetch(deleteRequest(), env, {});
    expect(response.status).toBe(401);
  });

  it('rejects anonymous callers', async () => {
    authenticateMock.mockResolvedValue({ authenticated: false });

    const response = await worker.fetch(deleteRequest(), env, {});
    expect(response.status).toBe(401);
  });
});
