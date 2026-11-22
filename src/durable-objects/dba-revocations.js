/**
 * DbaRevocations Durable Object (one, named "global"): devicebasedauth.org credentials DBA
 * told us were revoked, through its revocation webhook (POST /api/dba/events, spec/events.md
 * in devicebasedauth.org).
 *
 * Each revoked status entry ("<status list uri>#<idx>") is kept until that credential's
 * expiry. Isolates read the whole set at most every 30 seconds (src/auth/dba-auth.js), so a
 * revocation takes effect here well before the status list's cache runs out. The status
 * lists stay authoritative: this only ever adds revocations.
 */

const json = (body, status = 200) => Response.json(body, { status });
const MAX_ENTRIES = 10000;
const PRUNE_EVERY_MS = 3600 * 1000;

export class DbaRevocations {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    const now = Math.floor(Date.now() / 1000);

    if (pathname === '/revoked' && request.method === 'GET') {
      const rows = await this.state.storage.list({ prefix: 'r:', limit: MAX_ENTRIES });
      const revoked = [...rows].filter(([, entry]) => entry.exp >= now).map(([key]) => key.slice(2));
      return json({ revoked });
    }

    if (pathname === '/revoke' && request.method === 'POST') {
      const data = await request.json().catch(() => null);
      const credentials = Array.isArray(data?.credentials) ? data.credentials : null;
      if (!credentials?.length || credentials.length > 100) return json({ error: 'invalid_request' }, 400);
      const entries = {};
      for (const credential of credentials) {
        const { uri, idx } = credential?.status || {};
        if (typeof uri !== 'string' || !Number.isSafeInteger(idx) || !Number.isSafeInteger(credential.exp)) return json({ error: 'invalid_request' }, 400);
        if (credential.exp < now) continue;
        entries[`r:${uri}#${idx}`] = { exp: credential.exp, cid: typeof credential.cid === 'string' ? credential.cid : null, recorded_at: now };
      }
      if (Object.keys(entries).length) await this.state.storage.put(entries);
      if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + PRUNE_EVERY_MS);
      return json({ recorded: Object.keys(entries).length });
    }

    return json({ error: 'Not found' }, 404);
  }

  async alarm() {
    const now = Math.floor(Date.now() / 1000);
    const rows = await this.state.storage.list({ prefix: 'r:' });
    const expired = [...rows].filter(([, entry]) => entry.exp < now).map(([key]) => key);
    for (let i = 0; i < expired.length; i += 128) await this.state.storage.delete(expired.slice(i, i + 128));
    if (rows.size > expired.length) await this.state.storage.setAlarm(Date.now() + PRUNE_EVERY_MS);
  }
}
