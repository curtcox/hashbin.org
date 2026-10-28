import { beforeEach, describe, expect, it } from 'vitest';
import { moveAccount } from './account-move.js';
import { handleBackupRequest } from '../utils/backup.js';

// Objects that serve only the real backup/restore paths, over an in-memory store
function namespace() {
  const objects = new Map();
  const object = (name) => {
    if (!objects.has(name)) {
      const data = new Map();
      const storage = {
        list: async () => new Map(data),
        put: async (key, value) => { if (typeof key === 'string') data.set(key, value); else for (const [k, v] of Object.entries(key)) data.set(k, v); },
        deleteAll: async () => data.clear()
      };
      objects.set(name, { data, fetch: async (request) => (await handleBackupRequest({ storage }, request)) || new Response(null, { status: 404 }) });
    }
    return objects.get(name);
  };
  return { idFromName: (name) => name, get: object, data: (name) => object(name).data };
}

const OLD = 'user_dev_old';
const NEW = 'user_prod_new';
const CID = 'AAAAAABk' + 'a'.repeat(86);

describe('moveAccount', () => {
  let env;

  beforeEach(() => {
    env = { USER_PROFILES: namespace(), PAYMENT_RECORDS: namespace(), CONTENT_METADATA: namespace(),
      SUPPLIER_REGISTRY: namespace(), APPLICATION_REGISTRY: namespace() };
    env.USER_PROFILES.data(OLD).set('profile', {
      user_id: OLD, providers: ['google'], balance_cents: 4309, total_deposited_cents: 4596, deleted_at: null,
      uploads: [{ content_hash: CID }], supplier_ids: ['sup_1'], default_retention_months: 6,
      api_keys: [{ key_id: 'k1', revoked_at: null }], oauth_grants: [{ grant_id: 'g1', revoked_at: null }],
      oauth_refresh_tokens: [{ token_hash: 'h', revoked_at: null }], admin_keys: [{ key_id: 'a1', revoked_at: null }],
      download_budget: { sessions: { s1: { active: true, revoked_at: null } } }
    });
    env.USER_PROFILES.data(OLD).set('download-lease:x', { lease_uc: 1 });
    env.PAYMENT_RECORDS.data(OLD).set('transactions', [{ transaction_id: 't1', amount_cents: 4596 }]);
    env.CONTENT_METADATA.data(CID).set('content', { uploader_id: OLD, size_bytes: 10 });
    env.SUPPLIER_REGISTRY.data('sup_1').set('supplier', { supplier_id: 'sup_1', owner_user_id: OLD });
    env.APPLICATION_REGISTRY.data('global').set('apps', [{ app_id: 'app_1', owner_user_id: OLD }, { app_id: 'app_2', owner_user_id: 'someone' }]);
    env.USER_PROFILES.data(NEW).set('profile', { user_id: NEW, providers: ['google'], balance_cents: 0, total_deposited_cents: 0, uploads: [], api_keys: [], oauth_grants: [] });
  });

  it('reports a dry run without writing anything', async () => {
    const report = await moveAccount(env, { from: OLD, to: NEW, dryRun: true });
    expect(report).toMatchObject({ profile: 'copied', payment_records: 'copied', uploads: 1, suppliers: 1, apps: 1, balance_cents: 4309,
      revoked: { api_keys: 1, oauth_grants: 1, admin_keys: 1 } });
    expect(env.USER_PROFILES.data(NEW).get('profile').balance_cents).toBe(0);
    expect(env.CONTENT_METADATA.data(CID).get('content').uploader_id).toBe(OLD);
  });

  it('moves the balance, history and ownership, and revokes credentials naming the old ID', async () => {
    await moveAccount(env, { from: OLD, to: NEW });

    const moved = env.USER_PROFILES.data(NEW).get('profile');
    expect(moved).toMatchObject({ user_id: NEW, balance_cents: 4309, migrated_from: OLD, default_retention_months: 6 });
    expect(moved.api_keys[0].revoked_at).toBeTruthy();
    expect(moved.oauth_grants[0].revoked_at).toBeTruthy();
    expect(moved.oauth_refresh_tokens[0].revoked_at).toBeTruthy();
    expect(moved.admin_keys[0].revoked_at).toBeTruthy();
    expect(moved.download_budget.sessions.s1.revoked_at).toBeTruthy();
    expect(env.USER_PROFILES.data(NEW).get('download-lease:x')).toEqual({ lease_uc: 1 });
    expect(env.PAYMENT_RECORDS.data(NEW).get('transactions')).toHaveLength(1);

    expect(env.CONTENT_METADATA.data(CID).get('content').uploader_id).toBe(NEW);
    expect(env.SUPPLIER_REGISTRY.data('sup_1').get('supplier').owner_user_id).toBe(NEW);
    expect(env.APPLICATION_REGISTRY.data('global').get('apps').map(app => app.owner_user_id)).toEqual([NEW, 'someone']);

    const retired = env.USER_PROFILES.data(OLD).get('profile');
    expect(retired).toMatchObject({ user_id: OLD, balance_cents: 0, moved_balance_cents: 4309, migrated_to: NEW });
    expect(retired.deleted_at).toBeTruthy();
    expect(retired.api_keys[0].revoked_at).toBeTruthy();
  });

  it('finishes an interrupted move without copying again, and refuses a second destination', async () => {
    await moveAccount(env, { from: OLD, to: NEW });
    env.CONTENT_METADATA.data(CID).set('content', { uploader_id: OLD });
    env.USER_PROFILES.data(NEW).get('profile').balance_cents = 4000; // spent after the move

    const report = await moveAccount(env, { from: OLD, to: NEW });
    expect(report).toMatchObject({ resumed: true, profile: 'unchanged', uploads: 1 });
    expect(env.USER_PROFILES.data(NEW).get('profile').balance_cents).toBe(4000);
    expect(env.CONTENT_METADATA.data(CID).get('content').uploader_id).toBe(NEW);

    await expect(moveAccount(env, { from: OLD, to: 'user_other' })).rejects.toThrow('already moved');
  });

  it.each([
    ['the destination has a payment history', () => { env.PAYMENT_RECORDS.data(NEW).set('transactions', [{ amount_cents: 500 }]); }, 'already has account data'],
    ['the destination has spent', () => { env.USER_PROFILES.data(NEW).get('profile').total_spent_cents = 5; }, 'already has account data'],
    ['download accounting is pending', () => { env.USER_PROFILES.data(OLD).set('download-outbox:1', {}); }, 'accounting'],
    ['the source does not exist', () => { env.USER_PROFILES.data(OLD).clear(); }, 'No profile'],
    ['the source is deleted', () => { env.USER_PROFILES.data(OLD).get('profile').deleted_at = 'now'; }, 'deleted']
  ])('refuses when %s', async (_name, arrange, message) => {
    arrange();
    await expect(moveAccount(env, { from: OLD, to: NEW })).rejects.toThrow(message);
  });

  it('moves into an account that has never signed in', async () => {
    env.USER_PROFILES.data(NEW).clear();
    await moveAccount(env, { from: OLD, to: NEW });
    expect(env.USER_PROFILES.data(NEW).get('profile')).toMatchObject({ user_id: NEW, balance_cents: 4309, providers: ['google'] });
  });
});
