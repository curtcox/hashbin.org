import { downloadBudget, downloadIdentityValid, identityKey, UC_PER_CENT as UC, validDownloadCaps } from '../utils/download-budget.js';
import { findSpender, recordSpend, rollSpend, spendRoomCents } from '../utils/credential-spend.js';
import { readDownloadLease, downloadLeaseEntries } from './download-leases.js';
import { stageDownloadOutbox, hasDownloadOutbox } from './download-outbox.js';
export { flushDownloadOutbox } from './download-outbox.js';

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
async function returnLease(owner, profile, b, identity, data, writes, now) {
  if (!data.lease_id) return;
  const lease = await readDownloadLease(owner.state.storage, b, writes, data.lease_id, now.getTime());
  if (!lease || lease.returned_at || lease.identity !== identityKey(identity)) return;
  if (!Number.isSafeInteger(data.unused_uc) || data.unused_uc < 0 || data.unused_uc > lease.lease_uc) throw new Error('Invalid lease return');
  // Retain the receipt for the same retry window as outstanding leases. Removing
  // it would let a delayed allocation retry charge for this lease again.
  lease.returned_at = new Date().toISOString();
  writes.set(data.lease_id, lease);
  delete b.leases[data.lease_id]; // Migrate legacy receipts on access.
  const amount = data.unused_uc;
  b.float_uc += amount;
  for (const usage of [b.spend.account, lease.k && b.spend.keys[lease.k]].filter(Boolean)) {
    if (b.spend.day === lease.day) usage.day_uc -= amount;
    if (b.spend.month === lease.month) usage.month_uc -= amount;
  }
  const credential = (lease.kind === 'oauth' || lease.kind === 'key') && findSpender(profile, { kind: lease.kind, id: lease.k });
  if (credential && b.spend.month === lease.month && credential.spend_reset === (lease.spend_reset ?? lease.grant_reset)) recordSpend(credential, -amount / UC);
  if (amount) outbox(profile, { revenue_cents: -amount / UC, period: lease.month });
}

async function saveDownloadBudget(owner, profile, now, writes) {
  profile.updated_at = now.toISOString();
  const entries = { profile, ...downloadLeaseEntries(writes) };
  stageDownloadOutbox(profile, entries);
  // The balance, float, caps, lease and durable accounting outbox commit together.
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const alarmAt = hasDownloadOutbox(profile) ? Math.min(Date.now() + 1000, nextMonth) : nextMonth;
  const pendingAlarm = await owner.state.storage.getAlarm?.();
  // Frequent checks and leases must not keep pushing an undelivered outbox
  // into the future. Preserve an earlier retry or monthly rollover alarm.
  if (pendingAlarm == null || pendingAlarm > alarmAt) await owner.state.storage.setAlarm?.(alarmAt);
  await owner.state.storage.put(entries);
}

export async function handleDownloadBudget(owner, request) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const profile = await owner.state.storage.get('profile');
  if (!profile || profile.deleted_at) return Response.json({ error: 'Profile not found' }, { status: 404 });
  const now = new Date();
  const b = downloadBudget(profile, now);
  const writes = new Map();
  const data = ['POST', 'PUT', 'DELETE'].includes(method) ? await request.json() : {};
  // Returns from the previous UTC window must be reconciled before rolling it over.
  if (path === '/download/lease' || path === '/download/return') await returnLease(owner, profile, b, data.identity, data, writes, now);
  rollover(profile, b, now);
  const reply = async (body, status = 200) => {
    await saveDownloadBudget(owner, profile, now, writes);
    return Response.json(body, { status });
  };
  let result;
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
    for (const [id, s] of Object.entries(b.sessions)) {
      if (s.revoked_at || s.expires_at <= now.getTime() || (!s.active && s.handshake_expires_at <= now.getTime())) delete b.sessions[id];
    }
    if (Object.keys(b.sessions).length >= 100) return Response.json({ error: 'Revoke an existing session first' }, { status: 400 });
    const sid = crypto.randomUUID();
    b.sessions[sid] = { created_at: now.toISOString(), revoked_at: null, active: false, expires_at: now.getTime() + 30 * 86400000, handshake_expires_at: now.getTime() + 60000 };
    result = { sid };
  } else if (path === '/download/sessions' && method === 'DELETE') {
    if (!Object.hasOwn(b.sessions, data.sid)) return Response.json({ error: 'Session not found' }, { status: 404 });
    b.sessions[data.sid].revoked_at = now.toISOString(); result = { revoked: true };
  } else if (path === '/download/session/activate' && method === 'POST') {
    const s = Object.hasOwn(b.sessions, data.sid) ? b.sessions[data.sid] : null;
    if (!s || s.revoked_at || s.active || s.handshake_expires_at <= now.getTime()) return Response.json({ error: 'Invalid handshake' }, { status: 401 });
    s.active = true; result = { expires_at: s.expires_at };
  } else if (path === '/download/return' && method === 'POST') {
    result = { returned: true };
  } else if ((path === '/download/lease' || path === '/download/check') && method === 'POST') {
    // A returned remainder is independent of eligibility for a replacement.
    // Commit it even when revocation or the hard stop rejects that replacement.
    if (owner.env.COST_SAFETY_HARD_STOP === 'true') return reply({ funded: false, reason: 'hard_stop' }, 503);
    if (!downloadIdentityValid(profile, data.identity, now.getTime(), typeof data.cid === 'string' ? data.cid : undefined)) return reply({ funded: false, reason: 'invalid_identity' }, 401);
    const identity = data.identity, price = data.price_uc;
    if (!Number.isSafeInteger(price) || price < 400 || !Number.isInteger(data.requests) || data.requests < 1 || data.requests > 250 ||
      typeof data.request_id !== 'string' || !data.request_id.length || data.request_id.length > 100) return reply({ error: 'Invalid lease' }, 400);
    // Retrying a request after a lost DO response must not debit twice.
    const prior = await readDownloadLease(owner.state.storage, b, writes, data.request_id, now.getTime());
    if (prior) {
      if (prior.identity !== identityKey(identity) ||
        (prior.price_uc !== undefined && (prior.price_uc !== price || prior.requests !== data.requests))) {
        return reply({ error: 'Lease request mismatch' }, 400);
      }
      if (prior.returned_at) return reply({ funded: false, reason: 'returned' });
      return reply({ ...prior, lease_id: data.request_id, funded: true });
    }
    const usage = identity.k ? (b.spend.keys[identity.k] ||= { day_uc: 0, month_uc: 0 }) : null;
    let room = (profile.balance_cents || 0) * UC + b.float_uc;
    for (const [caps, used] of [[b.account, b.spend.account], ...(identity.k ? [[b.keys[identity.k], usage]] : [])]) {
      room = Math.min(room, caps ? caps.daily_cap_cents * UC - used.day_uc : 0, caps ? caps.monthly_cap_cents * UC - used.month_uc : 0);
    }
    // The key or grant's own monthly spending limit applies on top of download caps
    const credential = (identity.kind === 'oauth' || identity.kind === 'key') && findSpender(profile, { kind: identity.kind, id: identity.k }, now);
    if (credential) {
      rollSpend(credential, now, owner.nextMonthlyReset(now));
      const credentialRoom = spendRoomCents(credential);
      if (credentialRoom !== Infinity) room = Math.min(room, Math.floor(credentialRoom * UC + 0.0001));
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
      if (credential) recordSpend(credential, amount / UC);
      // Keep old leases long enough for delayed returns; evicted isolates remain spent.
      for (const [id, l] of Object.entries(b.leases)) if (l.expires_at < now.getTime() - 86400000) delete b.leases[id];
      const expires_at = Math.min(now.getTime() + 60000, Date.parse(`${b.spend.day}T00:00:00Z`) + 86400000,
        data.identity.exp ? data.identity.exp * 1000 : Infinity);
      const lease = { identity: identityKey(identity), kind: identity.kind, k: identity.k, spend_reset: credential?.spend_reset,
        price_uc: price, requests: data.requests, lease_uc: amount, expires_at, day: b.spend.day, month: b.spend.month };
      writes.set(data.request_id, lease);
      outbox(profile, { revenue_cents: amount / UC });
      result = { funded: true, lease_id: data.request_id, lease_uc: amount, expires_at };
    }
  } else return Response.json({ error: 'Not found' }, { status: 404 });
  return reply(result);
}
