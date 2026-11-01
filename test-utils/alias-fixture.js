import { vi } from 'vitest';
import { UserProfile } from '../src/durable-objects/user-profile.js';
import { AliasRecord } from '../src/durable-objects/alias-record.js';
import { PaymentRecord } from '../src/durable-objects/payment-record.js';
import { PlatformStats } from '../src/durable-objects/platform-stats.js';
import { DisputeRecord } from '../src/durable-objects/dispute-record.js';
import { DisputeIndex } from '../src/durable-objects/dispute-index.js';
import { AlertStore } from '../src/durable-objects/alert-store.js';

export function memoryState(initial = {}) {
  const values = new Map(Object.entries(structuredClone(initial)));
  let alarm = null;
  const storage = {
    get: async key => structuredClone(values.get(key)),
    put: async (key, value) => {
      const entries = typeof key === 'string' ? [[key, value]] : Object.entries(key);
      if (entries.length > 128) throw new Error('Too many keys');
      for (const [k, v] of entries) {
        if (new TextEncoder().encode(JSON.stringify(v)).length > 128 * 1024) throw new Error('Value exceeds SQLite DO limit');
        values.set(k, structuredClone(v));
      }
    },
    list: async ({ prefix = '', limit = Infinity, end, reverse = false } = {}) => new Map([...values].filter(([key]) => key.startsWith(prefix) && (!end || key < end)).sort(([a], [b]) => reverse ? b.localeCompare(a) : a.localeCompare(b)).slice(0, limit).map(([k, v]) => [k, structuredClone(v)])),
    delete: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key); },
    deleteAll: vi.fn(async () => values.clear()),
    getAlarm: async () => alarm,
    setAlarm: vi.fn(async at => { alarm = Number(at); }),
    transaction: async fn => {
      const previous = structuredClone(values);
      try { return await fn(storage); }
      catch (cause) { values.clear(); for (const [k, v] of previous) values.set(k, v); throw cause; }
    }
  };
  return { storage, values, blockConcurrencyWhile: async fn => fn() };
}

export function aliasFixture() {
  const env = { ENVIRONMENT: 'local' };
  function namespace(Class, initial = () => ({})) {
    const objects = new Map();
    const get = name => {
      if (!objects.has(name)) {
        const state = memoryState(initial(name)), object = new Class(state, env);
        objects.set(name, { state, object, fetch: vi.fn(request => object.fetch(request)) });
      }
      return objects.get(name);
    };
    return { idFromName: name => name, get, objects };
  }
  env.USER_PROFILES = namespace(UserProfile, user_id => ({ profile: { user_id, balance_cents: 10000,
    api_keys: [], oauth_grants: [], uploads: [], total_spent_cents: 0, total_deposited_cents: 10000 } }));
  env.PAYMENT_RECORDS = namespace(PaymentRecord);
  env.PLATFORM_STATS = namespace(PlatformStats);
  env.ALIAS_RECORDS = namespace(AliasRecord);
  env.DISPUTE_RECORD = namespace(DisputeRecord);
  env.DISPUTE_INDEX = namespace(DisputeIndex);
  env.ALERT_STORE = namespace(AlertStore);
  const personal = (user, path = '', body, method = body ? 'POST' : 'GET') => env.USER_PROFILES.get(user).fetch(
    new Request(`https://internal/aliases${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const global = (name, action, body = {}, user_id = 'seller') => env.ALIAS_RECORDS.get(`alias:${name}`).fetch(
    new Request(`https://internal/${action}`, { method: 'POST', body: JSON.stringify({ name, user_id, ...body }) }));
  const balance = async user => (await env.USER_PROFILES.get(user).state.storage.get('profile')).balance_cents;
  return { env, personal, global, balance };
}
