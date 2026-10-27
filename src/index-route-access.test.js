import { describe, expect, it, vi } from 'vitest';

const { authenticateMock } = vi.hoisted(() => ({ authenticateMock: vi.fn() }));

vi.mock('./auth/middleware.js', async () => {
  const actual = await vi.importActual('./auth/middleware.js');
  return { ...actual, authenticate: authenticateMock, applyRateLimit: () => null };
});

import worker, { apiRoutes } from './index.js';
import { ALL_ADMIN_SCOPES, ALL_USER_SCOPES, PUBLIC, SESSION, USER_SCOPES, ADMIN_SCOPES, checkAccess } from './auth/scopes.js';

const unauthenticated = () => new Response(null, { status: 401 });

function principal(scopes, session = false) {
  return { authenticated: true, user: { userId: 'user_1', session, scopes, caveats: {} } };
}

const anonymous = { authenticated: false, user: null };
const userSession = principal([...ALL_USER_SCOPES], true);
const adminSession = principal([...ALL_USER_SCOPES, ...ALL_ADMIN_SCOPES], true);
const keyWithEveryUserScope = principal([...ALL_USER_SCOPES]);
const keyWithNoScopes = principal([]);
const adminKey = principal([...ALL_ADMIN_SCOPES]);

function status(authResult, access) {
  return checkAccess(authResult, access, unauthenticated)?.status ?? 200;
}

function scopesOf(access) {
  return Array.isArray(access) ? access : [access];
}

// The route's path as text: a literal path, or its pattern without escapes or anchors
function samplePath(route) {
  return typeof route.path === 'string' ? route.path : route.path.source.replace(/\\\//g, '/').replace(/^\^|\$$/g, '');
}

describe('route access declarations', () => {
  const routes = apiRoutes();

  it('declares a valid access level on every route', () => {
    for (const route of routes) {
      const { access } = route;
      const valid = access === PUBLIC || access === SESSION || (scopesOf(access).length > 0 &&
        scopesOf(access).every(scope => Object.hasOwn(USER_SCOPES, scope) || Object.hasOwn(ADMIN_SCOPES, scope)));
      expect(valid, `${route.method} ${route.path}`).toBe(true);
      expect(typeof route.handler).toBe('function');
    }
  });

  it('requires an admin scope on every admin route', () => {
    for (const route of routes.filter(r => samplePath(r).startsWith('/api/admin/'))) {
      expect(scopesOf(route.access).every(scope => scope.startsWith('admin:')), String(route.path)).toBe(true);
    }
  });

  it('keeps account management to the account session', () => {
    const sessionOnly = ['/api/auth/apikeys', '/api/developers/apps', '/api/account/settings', '/api/account/authorizations',
      '/api/balance/deposit', '/api/downloads/budget', '/api/downloads/sessions', '/api/auth/account', '/oauth/authorize'];
    for (const path of sessionOnly) {
      const matching = routes.filter(r => samplePath(r).startsWith(path) && !(path === '/oauth/authorize' && r.method === 'GET'));
      expect(matching.length, path).toBeGreaterThan(0);
      for (const route of matching) expect(route.access, `${route.method} ${path}`).toBe(SESSION);
    }
  });

  it.each(apiRoutes().map(route => [`${route.method} ${samplePath(route)}`, route]))('enforces %s for every credential kind', (_name, route) => {
    const { access } = route;
    if (access === PUBLIC) {
      for (const who of [anonymous, keyWithNoScopes, userSession]) expect(status(who, access)).toBe(200);
      return;
    }
    expect(status(anonymous, access)).toBe(401);
    expect(status(keyWithNoScopes, access)).toBe(403);
    if (access === SESSION) {
      expect(status(userSession, access)).toBe(200);
      expect(status(adminSession, access)).toBe(200);
      expect(status(keyWithEveryUserScope, access)).toBe(403);
      expect(status(adminKey, access)).toBe(403);
      return;
    }
    const scopes = scopesOf(access);
    const userRoute = scopes.some(scope => !scope.startsWith('admin:'));
    const adminRoute = scopes.some(scope => scope.startsWith('admin:'));
    expect(status(adminSession, access)).toBe(200);
    expect(status(userSession, access)).toBe(userRoute ? 200 : 403);
    expect(status(keyWithEveryUserScope, access)).toBe(userRoute ? 200 : 403);
    expect(status(adminKey, access)).toBe(adminRoute ? 200 : 403);
    for (const scope of scopes) expect(status(principal([scope]), access)).toBe(200);
    const others = [...ALL_USER_SCOPES, ...ALL_ADMIN_SCOPES].filter(scope => !scopes.includes(scope));
    expect(status(principal(others), access)).toBe(403);
  });
});

describe('route dispatch', () => {
  const env = {};

  it('answers 404 for undeclared API paths', async () => {
    authenticateMock.mockResolvedValue(userSession);
    const response = await worker.fetch(new Request('https://hashbin.test/api/not-a-route'), env, {});
    expect(response.status).toBe(404);
  });

  it('refuses account settings to a key, whatever its scopes', async () => {
    authenticateMock.mockResolvedValue(keyWithEveryUserScope);
    const response = await worker.fetch(new Request('https://hashbin.test/api/account/settings', { method: 'PATCH', body: '{}' }), env, {});
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('session_required');
  });

  it('refuses a scope the credential lacks before running the handler', async () => {
    authenticateMock.mockResolvedValue(principal(['balance:read']));
    const response = await worker.fetch(new Request('https://hashbin.test/api/content/rate-limit/purchase', { method: 'POST', body: '{}' }), env, {});
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('insufficient_scope');
  });

  it('gives admin routes to admin scopes only', async () => {
    authenticateMock.mockResolvedValue(userSession);
    expect((await worker.fetch(new Request('https://hashbin.test/api/admin/stats'), env, {})).status).toBe(403);
    authenticateMock.mockResolvedValue(anonymous);
    expect((await worker.fetch(new Request('https://hashbin.test/api/admin/stats'), env, {})).status).toBe(401);
  });

  it('does not treat a key as the user on public routes', async () => {
    const metadata = { fetch: async () => new Response('{}', { status: 404 }) };
    authenticateMock.mockResolvedValue(keyWithEveryUserScope);
    const request = new Request('https://hashbin.test/api/content/AAAAAAAAabc');
    await worker.fetch(request, { CONTENT_METADATA: { idFromName: name => name, get: () => metadata } }, {});
    expect(request.user).toBeUndefined();
  });
});
