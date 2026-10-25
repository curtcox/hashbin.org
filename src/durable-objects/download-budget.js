import { downloadBudget, downloadIdentityValid, identityKey, UC_PER_CENT as UC, validDownloadCaps } from '../utils/download-budget.js';

function outbox(profile, event) {
  profile.download_event_sequence = (profile.download_event_sequence || 0) + 1;
  (profile.download_outbox ||= []).push({ id: crypto.randomUUID(), user_id: profile.user_id, sequence: profile.download_event_sequence, period: new Date().toISOString().slice(0, 7), ...event });
}
function moneyMovement(profile, amount, type) {
  const before = profile.balance_cents || 0;
  profile.balance_cents = before - amount;
  profile.total_spent_cents = (profile.total_spent_cents || 0) + amount;
  outbox(profile, { transaction: { transaction_id: crypto.randomUUID(), user_id: profile.user_id, type,
    amount_cents: amount, balance_before_cents: before, balance_after_cents: profile.balance_cents } });
}
function rollover(profile, b, now) {
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  if (month !== b.spend.month) {
    // Balances use whole cents. Preserve the sub-cent remainder as spending credit.
    const refund = Math.floor(b.float_uc / UC);
    if (refund) { b.float_uc -= refund * UC; moneyMovement(profile, -refund, 'download_refund'); }
    b.spend.month = month;
    b.spend.account.month_uc = 0;
    for (const usage of Object.values(b.spend.keys)) usage.month_uc = 0;
  }
  if (day !== b.spend.day) {
    b.spend.day = day; b.spend.account.day_uc = 0;
    for (const usage of Object.values(b.spend.keys)) usage.day_uc = 0;
  }
}
function returnLease(profile, b, identity, data) {
  if (!data.lease_id) return;
  const lease = b.leases[data.lease_id];
  if (!lease || lease.identity !== identityKey(identity)) return;
  if (!Number.isSafeInteger(data.unused_uc) || data.unused_uc < 0 || data.unused_uc > lease.lease_uc) throw new Error('Invalid lease return');
  delete b.leases[data.lease_id]; // A remainder can be returned exactly once.
  const amount = data.unused_uc;
  b.float_uc += amount;
  for (const usage of [b.spend.account, lease.k && b.spend.keys[lease.k]].filter(Boolean)) {
    if (b.spend.day === lease.day) usage.day_uc -= amount;
    if (b.spend.month === lease.month) usage.month_uc -= amount;
  }
  const grant = lease.kind === 'oauth' && profile.oauth_grants?.find(g => g.grant_id === lease.k);
  if (grant && b.spend.month === lease.month && grant.spending_reset === lease.grant_reset) grant.spending_used = Math.max(0, (grant.spending_used || 0) - amount / UC / 100);
  if (amount) outbox(profile, { revenue_cents: -amount / UC, period: lease.month });
}

export async function handleDownloadBudget(owner, request) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const profile = await owner.state.storage.get('profile');
  if (!profile || profile.deleted_at) return Response.json({ error: 'Profile not found' }, { status: 404 });
  const now = new Date();
  const b = downloadBudget(profile, now);
  const data = ['POST', 'PUT', 'DELETE'].includes(method) ? await request.json() : {};
  // Returns from the previous UTC window must be reconciled before rolling it over.
  if (path === '/download/lease' || path === '/download/return') returnLease(profile, b, data.identity, data);
  rollover(profile, b, now);
  let result;
  let status = 200;
  if (path === '/download/budget' && ['GET', 'PUT'].includes(method)) {
    if (method === 'PUT') {
      if (!validDownloadCaps(data.account)) return Response.json({ error: 'Invalid caps' }, { status: 400 });
      b.account = data.account;
    }
    result = { account: b.account, keys: b.keys, spend: b.spend, float_uc: b.float_uc, balance_cents: profile.balance_cents };
  } else if (path === '/download/key-budget' && method === 'PUT') {
    const collection = data.kind === 'oauth' ? profile.oauth_grants : profile.api_keys;
    if (!collection?.some(k => (k.key_id || k.grant_id) === data.key_id && !k.revoked_at)) return Response.json({ error: 'Key or grant not found' }, { status: 404 });
    if (!validDownloadCaps(data.caps)) return Response.json({ error: 'Invalid caps' }, { status: 400 });
    if (data.caps === null) delete b.keys[data.key_id]; else b.keys[data.key_id] = data.caps;
    result = { caps: data.caps };
  } else if (path === '/download/sessions' && method === 'GET') {
    result = { sessions: Object.entries(b.sessions).map(([session_id, s]) => ({ session_id, ...s })) };
  } else if (path === '/download/sessions' && method === 'POST') {
    for (const [id, s] of Object.entries(b.sessions)) if (s.expires_at <= now.getTime()) delete b.sessions[id];
    if (Object.keys(b.sessions).length >= 100) return Response.json({ error: 'Revoke an existing session first' }, { status: 400 });
    const sid = crypto.randomUUID();
    b.sessions[sid] = { created_at: now.toISOString(), revoked_at: null, active: false, expires_at: now.getTime() + 30 * 86400000, handshake_expires_at: now.getTime() + 60000 };
    result = { sid };
  } else if (path === '/download/sessions' && method === 'DELETE') {
    if (!b.sessions[data.sid]) return Response.json({ error: 'Session not found' }, { status: 404 });
    b.sessions[data.sid].revoked_at = now.toISOString(); result = { revoked: true };
  } else if (path === '/download/session/activate' && method === 'POST') {
    const s = b.sessions[data.sid];
    if (!s || s.revoked_at || s.active || s.handshake_expires_at <= now.getTime()) return Response.json({ error: 'Invalid handshake' }, { status: 401 });
    s.active = true; result = { expires_at: s.expires_at };
  } else if (path === '/download/return' && method === 'POST') {
    result = { returned: true };
  } else if ((path === '/download/lease' || path === '/download/check') && method === 'POST') {
    if (owner.env.COST_SAFETY_HARD_STOP === 'true') return Response.json({ funded: false, reason: 'hard_stop' }, { status: 503 });
    if (!downloadIdentityValid(profile, data.identity)) return Response.json({ funded: false, reason: 'invalid_identity' }, { status: 401 });
    const identity = data.identity, price = data.price_uc;
    if (!Number.isSafeInteger(price) || price < 400 || !Number.isInteger(data.requests) || data.requests < 1 || data.requests > 250 ||
      typeof data.request_id !== 'string' || data.request_id.length > 100) return Response.json({ error: 'Invalid lease' }, { status: 400 });
    // Retrying a request after a lost DO response must not debit twice.
    const prior = b.leases[data.request_id];
    if (prior) {
      if (prior.identity !== identityKey(identity)) return Response.json({ error: 'Lease identity mismatch' }, { status: 400 });
      return Response.json({ ...prior, lease_id: data.request_id, funded: true });
    }
    const usage = identity.k ? (b.spend.keys[identity.k] ||= { day_uc: 0, month_uc: 0 }) : null;
    let room = (profile.balance_cents || 0) * UC + b.float_uc;
    for (const [caps, used] of [[b.account, b.spend.account], ...(identity.k ? [[b.keys[identity.k], usage]] : [])]) {
      room = Math.min(room, caps ? caps.daily_cap_cents * UC - used.day_uc : 0, caps ? caps.monthly_cap_cents * UC - used.month_uc : 0);
    }
    const grant = identity.kind === 'oauth' && profile.oauth_grants.find(g => g.grant_id === identity.k);
    if (grant) {
      if (!grant.spending_reset || new Date(grant.spending_reset) <= now) { grant.spending_used = 0; grant.spending_reset = owner.nextMonthlyReset(now); }
      if (grant.spending_limit != null) room = Math.min(room, Math.floor((grant.spending_limit - (grant.spending_used || 0)) * 100 * UC + 0.0001));
    }
    const amount = Math.floor(Math.min(room, price * data.requests) / price) * price;
    if (amount < price) result = { funded: false, reason: 'exhausted' };
    else if (path === '/download/check') result = { funded: true, expires_at: now.getTime() + 60000 };
    else {
      const debit = Math.max(0, Math.ceil((amount - b.float_uc) / UC));
      if (debit) { moneyMovement(profile, debit, 'download_spend'); b.float_uc += debit * UC; }
      b.float_uc -= amount;
      b.spend.account.day_uc += amount; b.spend.account.month_uc += amount;
      if (usage) { usage.day_uc += amount; usage.month_uc += amount; }
      if (grant) grant.spending_used = (grant.spending_used || 0) + amount / UC / 100;
      // Keep old leases long enough for delayed returns; evicted isolates remain spent.
      for (const [id, l] of Object.entries(b.leases)) if (l.expires_at < now.getTime() - 86400000) delete b.leases[id];
      const expires_at = Math.min(now.getTime() + 60000, Date.parse(`${b.spend.day}T00:00:00Z`) + 86400000,
        data.identity.exp ? data.identity.exp * 1000 : Infinity);
      const lease = { identity: identityKey(identity), kind: identity.kind, k: identity.k, grant_reset: grant?.spending_reset, lease_uc: amount, expires_at, day: b.spend.day, month: b.spend.month };
      b.leases[data.request_id] = lease;
      outbox(profile, { revenue_cents: amount / UC });
      result = { funded: true, lease_id: data.request_id, lease_uc: amount, expires_at };
    }
  } else return Response.json({ error: 'Not found' }, { status: 404 });
  profile.updated_at = now.toISOString();
  // The balance, float, caps, lease and durable accounting outbox commit together.
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  await owner.state.storage.setAlarm?.(profile.download_outbox?.length ? Date.now() + 1000 : nextMonth);
  await owner.state.storage.put('profile', profile);
  return Response.json(result, { status });
}

export async function flushDownloadOutbox(owner) {
  const profile = await owner.state.storage.get('profile');
  if (!profile?.download_outbox?.length) return;
  for (const event of profile.download_outbox) {
    if (event.transaction && owner.env.PAYMENT_RECORDS) {
      const response = await owner.env.PAYMENT_RECORDS.get(owner.env.PAYMENT_RECORDS.idFromName(profile.user_id)).fetch(new Request('https://internal/transaction', {
        method: 'POST', body: JSON.stringify(event.transaction) }));
      if (!response.ok) throw new Error('Download transaction unavailable');
    } else if (event.revenue_cents !== undefined && owner.env.PLATFORM_STATS) {
      const response = await owner.env.PLATFORM_STATS.get(owner.env.PLATFORM_STATS.idFromName('global')).fetch(new Request('https://internal/download-revenue', {
        method: 'POST', body: JSON.stringify(event) }));
      if (!response.ok) throw new Error('Download revenue unavailable');
    } else throw new Error('Download accounting bindings unavailable');
  }
  profile.download_outbox = [];
  await owner.state.storage.put('profile', profile);
}
