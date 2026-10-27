import { beforeEach, describe, expect, it } from 'vitest';
import { handleCreateAdminKey, handleListAdminKeys, handleRevokeAdminKey } from './admin-keys.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { authenticate } from '../auth/middleware.js';
import { checkAccess } from '../auth/scopes.js';

function profileBinding() {
  const instances = new Map();
  return {
    idFromName: (name) => ({ toString: () => name }),
    get: (id) => {
      const userId = id.toString();
      if (!instances.has(userId)) {
        const storage = new Map([['profile', { user_id: userId, providers: ['local'], deleted_at: null, api_keys: [], balance_cents: 0 }]]);
        instances.set(userId, new UserProfile({ storage: { get: async (key) => storage.get(key), put: async (key, value) => storage.set(key, value) } }, {}));
      }
      return instances.get(userId);
    }
  };
}

const ADMIN = 'the_admin';

describe('admin keys', () => {
  let env;
  beforeEach(() => {
    env = { ENVIRONMENT: 'local', ADMIN_USER_ID: ADMIN, DOWNLOAD_TOKEN_SECRET: 'test-secret', USER_PROFILES: profileBinding() };
  });

  const asAdmin = (method, body) => new Request('https://hashbin.test/api/admin/keys', {
    method, headers: { authorization: `LocalDev ${ADMIN}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const withKey = (key) => new Request('https://hashbin.test/api/admin/stats', { headers: { authorization: `ApiKey ${key}` } });
  const issue = async (body) => (await handleCreateAdminKey(asAdmin('POST', body), env)).json();

  it.each([
    [{ scopes: ['content:write'], expires_in_days: 30 }, 'Invalid scopes'],
    [{ scopes: [], expires_in_days: 30 }, 'Invalid scopes'],
    [{ scopes: ['admin:stats'], expires_in_days: 91 }, 'Invalid expiration'],
    [{ scopes: ['admin:stats'] }, 'Invalid expiration']
  ])('refuses %j', async (body, error) => {
    const response = await handleCreateAdminKey(asAdmin('POST', body), env);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });

  it('issues a hash-only key that holds exactly its admin scopes', async () => {
    const created = await issue({ name: 'Cost report', scopes: ['admin:costs'], expires_in_days: 30 });
    expect(created.admin_key).toMatch(/^hba_/);
    expect(created).not.toHaveProperty('key_hash');

    const listed = await (await handleListAdminKeys(asAdmin('GET'), env)).json();
    expect(listed.keys[0]).toMatchObject({ name: 'Cost report', scopes: ['admin:costs'] });
    expect(listed.keys[0]).not.toHaveProperty('key_hash');
    expect(Object.keys(listed.scopes)).toContain('admin:restore');

    const auth = await authenticate(withKey(created.admin_key), env);
    expect(auth.user).toMatchObject({ authMethod: 'admin_key', session: false, scopes: ['admin:costs'], userId: ADMIN });
    expect(checkAccess(auth, 'admin:costs', () => null)).toBeNull();
    expect(checkAccess(auth, 'admin:restore', () => null).status).toBe(403);
    expect(checkAccess(auth, 'content:write', () => null).status).toBe(403);
    expect(checkAccess(auth, 'session', () => null).status).toBe(403);
  });

  it('stops working when revoked or when ADMIN_USER_ID changes', async () => {
    const created = await issue({ scopes: ['admin:stats'], expires_in_days: 7 });
    expect((await authenticate(withKey(created.admin_key), env)).authenticated).toBe(true);

    expect((await authenticate(withKey(created.admin_key), { ...env, ADMIN_USER_ID: 'someone_else' })).authenticated).toBe(false);

    await handleRevokeAdminKey(asAdmin('DELETE'), env, created.key_id);
    expect((await authenticate(withKey(created.admin_key), env)).authenticated).toBe(false);
  });

  it('cannot be minted from a user key or by a non-admin account', async () => {
    const userKey = new Request('https://hashbin.test', { headers: { authorization: 'LocalDev regular_user' } });
    const regular = await authenticate(userKey, env);
    expect(checkAccess(regular, 'admin-session', () => null).status).toBe(403);
    const admin = await authenticate(asAdmin('GET'), env);
    expect(checkAccess(admin, 'admin-session', () => null)).toBeNull();
  });
});
