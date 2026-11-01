import { readCostSafety } from './cost-safety-state.js';
import { normalizeAliasName } from './alias-names.js';

const environments = new WeakMap();
const TTL = 60000;

function state(env) {
  if (!environments.has(env)) environments.set(env, { personal: new Map(), weight: 0 });
  return environments.get(env);
}

/** Aliases never bypass the cost brake, even with funded download credit. */
export async function aliasSafety(env) {
  const current = state(env);
  if (env.COST_SAFETY_HARD_STOP === 'true') return { hard_stop: true, brake: true };
  if (!current.safety || current.safety.until <= Date.now()) {
    if (!current.safetyPending) current.safetyPending = readCostSafety(env).then(result => {
      current.safety = { ...result, until: Date.now() + TTL };
      return current.safety;
    }).finally(() => { current.safetyPending = null; });
    await current.safetyPending;
  }
  return current.safety;
}

/** Cache private maps by credential proof so revocation/caveats cannot cross credentials. */
export async function resolvePersonalAlias(env, identity, name, trustedApi = false) {
  const current = state(env), key = JSON.stringify(identity);
  let entry = current.personal.get(key);
  const cacheHit = Boolean(entry && entry.until > Date.now());
  if (!entry || entry.until <= Date.now()) {
    if (entry) { current.weight -= entry.weight; current.personal.delete(key); }
    while (current.personal.size >= 1000) {
      const oldest = current.personal.keys().next().value;
      current.weight -= current.personal.get(oldest).weight; current.personal.delete(oldest);
    }
    entry = { weight: 0, until: Math.min(Date.now() + TTL, (identity.exp || Infinity) * 1000) };
    // Install before awaiting the DO to coalesce concurrent misses.
    current.personal.set(key, entry);
    entry.pending = (async () => {
      const response = await env.USER_PROFILES.get(env.USER_PROFILES.idFromName(identity.u))
        .fetch(new Request(trustedApi ? 'https://internal/aliases' : 'https://internal/aliases/resolve-map', {
          ...(trustedApi ? {} : { method: 'POST', body: JSON.stringify({ identity }) }), signal: AbortSignal.timeout(5000) }));
      if (response.status === 401 || response.status === 404) return { invalid: true };
      if (!response.ok) throw new Error('Alias resolution unavailable');
      const { personal } = await response.json();
      const map = new Map(personal.map(a => [a.name, a]));
      if (current.personal.get(key) !== entry) return { map };
      entry.weight = map.size; current.weight += entry.weight;
      while (current.personal.size > 1000 || current.weight > 10000) {
        const oldest = current.personal.keys().next().value;
        current.weight -= current.personal.get(oldest).weight;
        current.personal.delete(oldest);
      }
      return { map };
    })();
    entry.pending.catch(() => { if (current.personal.get(key) === entry) current.personal.delete(key); });
  }
  const result = await entry.pending;
  if (result.invalid) return { invalid: true };
  const alias = result.map.get(name);
  return alias && Date.parse(alias.paid_through) > Date.now() ? { cid: alias.cid, source: 'personal', cacheHit } : null;
}

/** Cost monitoring includes refusals and successful redirects. */
export function sampleAliasResolution(env, name, status, hit = false) {
  if (env.DOWNLOAD_ANALYTICS && Math.random() < 0.01) {
    try { env.DOWNLOAD_ANALYTICS.writeDataPoint({ indexes: [`@${name}`], blobs: [`@${name}`, String(status), hit ? 'hit' : 'miss', 'anon'], doubles: [100, 0, 0] }); }
    catch (error) { console.warn('Alias sampling failed', error.message); }
  }
}

/** The shared global cache includes misses; identified viewers use the same entry. */
export async function resolveGlobalAlias(env, name) {
  const cache = globalThis.caches?.default;
  const key = new Request(`https://256t.us/_alias/${name}`);
  const cached = await cache?.match(key);
  if (cached) {
    const value = await cached.json();
    if (value.until > Date.now()) return { ...value.result, cacheHit: true, cacheUntil: value.until };
  }
  const response = await env.ALIAS_RECORDS.get(env.ALIAS_RECORDS.idFromName(`alias:${name}`))
    .fetch(new Request('https://internal/resolve', { method: 'POST', body: JSON.stringify({ name }), signal: AbortSignal.timeout(5000) }));
  if (![200, 404, 410, 451].includes(response.status)) throw new Error('Global resolution unavailable');
  const result = { ...await response.json(), status: response.status };
  const until = Math.min(Date.now() + TTL, result.cid ? Date.parse(result.paid_through) : Infinity);
  const ttl = Math.max(0, Math.floor((until - Date.now()) / 1000));
  if (ttl > 0) await cache?.put(key, Response.json({ result, until }, { headers: { 'Cache-Control': `public, max-age=${ttl}` } }));
  return { ...result, cacheUntil: until };
}

/** Resolve one exact name, with an active private alias taking precedence. */
export async function resolveAlias(env, input, identity) {
  const name = normalizeAliasName(input);
  if (!name) return { error: 'invalid_name', status: 404 };
  if (identity) {
    const personal = await resolvePersonalAlias(env, identity, name);
    if (personal?.invalid) return { error: 'invalid_identity', status: 401 };
    if (personal) return { ...personal, status: 200 };
  }
  return resolveGlobalAlias(env, name);
}
