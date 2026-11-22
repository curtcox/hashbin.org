// A replay cache shared by every isolate of a relying party's Worker (STATUS B4).
//
// The default ReplayCache lives in one isolate, so a captured DPoP proof could be replayed once
// against each other isolate (or Worker location) within its ~2-minute life. Deploy
// ReplayCacheDO in your own Worker and pass durableReplayCache(env.DBA_REPLAY) to
// createVerifier: each proof id is then claimed exactly once across all of them. It runs on your
// Cloudflare account; devicebasedauth.org is not involved and charges nothing.
import { ReplayCache, PROOF_MAX_AGE, CLOCK_SKEW } from './credential.js';

/** How long a proof id is remembered: proofs are accepted up to PROOF_MAX_AGE (+ skew) either way. */
export const REPLAY_TTL = PROOF_MAX_AGE * 2 + CLOCK_SKEW;

/**
 * Durable Object: POST {"keys": [...], "now": seconds} → {"fresh": [true|false, ...]}.
 * A key is fresh the first time it is seen within REPLAY_TTL. Entries are kept in storage, so a
 * restarted object still refuses replays, and an alarm deletes expired ones.
 */
export class ReplayCacheDO {
  constructor(state) { this.state = state; this.storage = state.storage; }

  async fetch(request) {
    let body;
    try { body = await request.json(); } catch { body = null; }
    if (!Array.isArray(body?.keys) || !body.keys.length || body.keys.length > 100 || body.keys.some(k => typeof k !== 'string' || k.length > 200)) {
      return Response.json({ error: 'keys must list 1–100 strings of at most 200 characters', code: 'invalid_request' }, { status: 400 });
    }
    const now = Number.isSafeInteger(body.now) ? body.now : Math.floor(Date.now() / 1000);
    const fresh = [];
    for (const key of body.keys) {
      const exp = await this.storage.get(`r:${key}`);
      if (exp !== undefined && exp > now) { fresh.push(false); continue; }
      await this.storage.put(`r:${key}`, now + REPLAY_TTL);
      fresh.push(true);
    }
    if (!(await this.storage.getAlarm())) await this.storage.setAlarm(Date.now() + REPLAY_TTL * 1000);
    return Response.json({ fresh });
  }

  async alarm() {
    const now = Math.floor(Date.now() / 1000);
    const rows = await this.storage.list({ prefix: 'r:', limit: 1000 });
    const expired = [...rows].filter(([, exp]) => exp <= now).map(([key]) => key);
    for (let i = 0; i < expired.length; i += 128) await this.storage.delete(expired.slice(i, i + 128));
    if (rows.size > expired.length || rows.size === 1000) await this.storage.setAlarm(Date.now() + (rows.size === 1000 ? 1000 : REPLAY_TTL * 1000));
  }
}

/** FNV-1a, to spread keys over shards. */
function shardOf(key, shards) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % shards;
}

/**
 * A replay cache backed by a ReplayCacheDO namespace binding, for createVerifier({ replay }).
 * shards spreads load over several objects (default 16). A local in-isolate cache answers
 * repeats without a round trip. If the object cannot be reached the check fails closed
 * (the proof is treated as replayed) unless failOpen is true.
 */
export function durableReplayCache(namespace, { shards = 16, failOpen = false } = {}) {
  if (!namespace?.idFromName) throw new Error('durableReplayCache needs a Durable Object namespace binding');
  const local = new ReplayCache(REPLAY_TTL);
  return {
    async check(key, now) {
      if (!local.check(key, now)) return false;
      try {
        const stub = namespace.get(namespace.idFromName(`dba-replay-${shardOf(key, shards)}`));
        const response = await stub.fetch('https://replay/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: [key], now }) });
        if (!response.ok) throw new Error(`replay cache answered ${response.status}`);
        return (await response.json()).fresh[0] === true;
      } catch {
        return failOpen;
      }
    }
  };
}
