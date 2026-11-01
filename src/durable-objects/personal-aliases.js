import { normalizeAliasName, isReservedAlias, validateAliasCid } from '../utils/alias-names.js';
import { COST_POLICY, retentionWithinCap } from '../utils/cost-policy.js';
import { PERSONAL_ALIAS_MONTHLY_CENTS } from '../utils/pricing.js';
import { findSpender, recordSpend, rollSpend, spendRoomCents } from '../utils/credential-spend.js';
import { downloadIdentityValid } from '../utils/download-budget.js';
import { stageDownloadOutbox } from './download-outbox.js';

const PREFIX = 'personal-alias:';
const RECEIPTS = 'alias-receipt:';
const DAY = 86400000;
const GRACE = 30 * DAY;
const RENEW_BEFORE = 7 * DAY;

function fail(error, status = 400, extra = {}) {
  return Response.json({ error, ...extra }, { status, headers: {
    'Cache-Control': 'private, no-store',
    ...(error === 'change_limit' ? { 'Retry-After': String(Math.ceil((DAY - Date.now() % DAY) / 1000)) } : {})
  } });
}

function advance(time, months) {
  const date = new Date(time);
  // Calendar months, clamped at the last day (Jan 31 + one month = Feb 28).
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return date.toISOString();
}

async function aliases(storage) {
  return storage.list({ prefix: PREFIX });
}

function windowCount(window, now) {
  return window?.day === Math.floor(now / DAY) ? window.count : 0;
}

/** Set the earliest alarm without postponing download accounting or other maintenance. */
export async function scheduleAliasAlarm(owner, at) {
  const pending = await owner.state.storage.getAlarm();
  if (pending === null || pending > at) await owner.state.storage.setAlarm(at);
}

function event(profile, entries, body) {
  profile.download_event_sequence = (profile.download_event_sequence || 0) + 1;
  (profile.download_outbox ||= []).push({ id: crypto.randomUUID(), user_id: profile.user_id,
    sequence: profile.download_event_sequence, period: new Date().toISOString().slice(0, 7), ...body });
  stageDownloadOutbox(profile, entries);
}

function charge(profile, entries, amount, names, months, automatic = false) {
  const before = profile.balance_cents || 0;
  profile.balance_cents = before - amount;
  profile.total_spent_cents = (profile.total_spent_cents || 0) + amount;
  profile.updated_at = new Date().toISOString();
  event(profile, entries, { transaction: { transaction_id: crypto.randomUUID(), type: 'personal_alias',
    user_id: profile.user_id, amount_cents: amount, balance_before_cents: before,
    balance_after_cents: profile.balance_cents, alias_names: names, alias_months: months, auto_renew: automatic } });
  event(profile, entries, { revenue_cents: amount, revenue_type: 'alias' });
  entries.profile = profile;
}

/** Personal alias changes run inside UserProfile's serialized request/alarm queue. */
export async function handlePersonalAliases(owner, request) {
  const storage = owner.state.storage, now = Date.now();
  const profile = await storage.get('profile');
  if (!profile || profile.deleted_at) return fail('Profile not found', 404);
  const url = new URL(request.url), method = request.method;
  if (profile.aliases_closing && method !== 'GET') return fail('account_closed', 403);
  const data = method === 'GET' || method === 'DELETE' ? {} : await request.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('invalid_request');
  if (url.pathname === '/aliases' && method === 'GET') {
    const rows = await aliases(storage);
    const count = windowCount(await storage.get('alias-changes'), now);
    return Response.json({ personal: [...rows.values()].filter(a => Date.parse(a.paid_through) + GRACE > now).map(publicAlias),
      global: [...(await storage.list({ prefix: 'global-alias:' })).values()],
      offers: [...(await storage.list({ prefix: 'alias-offer:' })).values()], changes_left: Math.max(0, COST_POLICY.aliasChangesPerDay - count),
      monthly_price_cents: PERSONAL_ALIAS_MONTHLY_CENTS, max_months: COST_POLICY.maxRetentionMonths,
      max_aliases: COST_POLICY.personalAliasesPerAccount }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  // The content Worker supplies a cryptographically verified identity. Recheck
  // revocation and CID caveats here before exposing this account's private map.
  if (url.pathname === '/aliases/resolve-map' && method === 'POST') {
    const scopes = ['aliases:read', 'downloads:spend'];
    if (!downloadIdentityValid(profile, data.identity, now, undefined, scopes)) return fail('invalid_identity', 401);
    const rows = await aliases(storage);
    const personal = [...rows.values()].filter(a => Date.parse(a.paid_through) > now &&
      downloadIdentityValid(profile, data.identity, now, a.cid, scopes));
    return Response.json({ personal: personal.map(a => ({ name: a.name, cid: a.cid, paid_through: a.paid_through })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const match = url.pathname.match(/^\/aliases\/personal(?:\/([^/]+)(\/renew)?)?$/);
  if (!match) return fail('Not found', 404);
  const create = !match[1] && method === 'POST';
  const renew = Boolean(match[2]) && method === 'POST';
  if (!(create || renew || (match[1] && !match[2] && ['PUT', 'PATCH', 'DELETE'].includes(method)))) return fail('Not found', 404);
  const name = normalizeAliasName(create ? data.name : match[1]);
  if (!name) return fail('invalid_name');
  if (isReservedAlias(name)) return fail('reserved_name', 403);
  const key = `${PREFIX}${name}`;
  let alias = await storage.get(key);
  if (alias && Date.parse(alias.paid_through) + GRACE <= now) alias = null;
  const entries = {};
  let receiptKey, fingerprint;
  if (create || renew) {
    const months = data.months ?? 12;
    if (!Number.isSafeInteger(months) || months < 1 || months > COST_POLICY.maxRetentionMonths) return fail('invalid_months');
    if (data.request_id !== undefined && (typeof data.request_id !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(data.request_id))) return fail('invalid_request_id');
    receiptKey = `${RECEIPTS}${data.request_id || crypto.randomUUID()}`;
    fingerprint = JSON.stringify([create ? 'create' : 'renew', name, months, data.cid || null, data.spender || null]);
    const prior = await storage.get(receiptKey);
    if (prior && prior.until > now) return prior.fingerprint === fingerprint
      ? Response.json(prior.result, { headers: { 'Cache-Control': 'private, no-store' } }) : fail('request_id_conflict', 409);
    if (create && alias) return fail('name_taken', 409);
    if (renew && !alias) return fail('alias_not_found', 404);
    if (create && !validateAliasCid(data.cid)) return fail('invalid_cid');
    if (create) {
      const rows = await aliases(storage);
      if ([...rows.values()].filter(a => Date.parse(a.paid_through) + GRACE > now).length >= COST_POLICY.personalAliasesPerAccount) return fail('alias_limit', 409);
    }
    if (!retentionWithinCap(alias?.paid_through, months, new Date(now))) return fail('retention_limit');
    const purchases = windowCount(await storage.get('alias-purchases'), now);
    if (purchases >= COST_POLICY.aliasChangesPerDay) return fail('change_limit', 429);
    const amount = months * PERSONAL_ALIAS_MONTHLY_CENTS;
    const spender = data.spender ? findSpender(profile, data.spender) : null;
    if (data.spender && !spender) return fail('invalid_credential', 403);
    if (spender) {
      rollSpend(spender, new Date(now), owner.nextMonthlyReset(new Date(now)));
      if (amount > spendRoomCents(spender)) return fail('spending_limit_exceeded', 403);
    }
    if ((profile.balance_cents || 0) < amount) return fail('insufficient_balance', 400, { required_cents: amount, balance_cents: profile.balance_cents || 0 });
    entries['alias-purchases'] = { day: Math.floor(now / DAY), count: purchases + 1 };
    if (spender) recordSpend(spender, amount);
    charge(profile, entries, amount, [name], months);
    alias = { ...(alias || { name, cid: data.cid, auto_renew: false, created_at: new Date(now).toISOString() }),
      paid_through: advance(Math.max(now, Date.parse(alias?.paid_through) || now), months),
      renewal_months: months, renewal_spender: data.spender || null };
    delete alias.renewal_retry_at;
  } else {
    if (!alias) return fail('alias_not_found', 404);
    if (method === 'PUT') {
      if (Date.parse(alias.paid_through) <= now) return fail('alias_expired', 410);
      if (!validateAliasCid(data.cid)) return fail('invalid_cid');
      alias.cid = data.cid;
    }
    if (method === 'PATCH') {
      if (typeof data.auto_renew !== 'boolean') return fail('invalid_auto_renew');
      // Session permission to enable auto-renew is explicit; delegated purchases
      // remain tied to the key/grant that originally paid for this term.
      alias.auto_renew = data.auto_renew;
      if (data.auto_renew) alias.renewal_spender = data.spender || null;
    }
  }
  // Settings count too: otherwise an unlimited free PATCH loop bypasses A16.
  if (!renew) {
    const count = windowCount(await storage.get('alias-changes'), now);
    if (count >= COST_POLICY.aliasChangesPerDay) return fail('change_limit', 429);
    entries['alias-changes'] = { day: Math.floor(now / DAY), count: count + 1 };
  }
  const result = method === 'DELETE' ? { deleted: true, name } : { alias: publicAlias(alias), ...(create || renew ? { charged_cents: (data.months ?? 12) * PERSONAL_ALIAS_MONTHLY_CENTS } : {}) };
  if (receiptKey) entries[receiptKey] = { until: now + 31 * DAY, fingerprint, result };
  alias.updated_at = new Date(now).toISOString();
  if (method !== 'DELETE') entries[key] = alias;
  // Schedule first: a crash before committing can cause harmless extra work,
  // while a committed payment must never lose its accounting/expiry alarm.
  if (create || renew) await scheduleAliasAlarm(owner, now + 1000);
  else if (method === 'PATCH' && alias.auto_renew) await scheduleAliasAlarm(owner,
    Math.max(now + 1000, Date.parse(alias.paid_through) - RENEW_BEFORE, alias.renewal_retry_at || 0));
  await storage.transaction(async txn => {
    if (method === 'DELETE') await txn.delete(key);
    await txn.put(entries);
  });
  return Response.json(result, { status: create ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } });
}

function publicAlias(alias) {
  const { renewal_spender: _spender, renewal_retry_at: _retry, ...value } = alias;
  return value;
}

/** Renew due aliases in one debit and transaction; delete after the 30-day grace. */
export async function maintainPersonalAliases(owner) {
  const storage = owner.state.storage, now = Date.now();
  const profile = await storage.get('profile');
  const rows = await aliases(storage);
  const writes = {}, removed = [], renewed = [];
  let months = 0, total = 0, next = Infinity;
  const available = profile?.deleted_at || profile?.aliases_closing ? 0 : profile?.balance_cents || 0;
  for (const [key, alias] of rows) {
    const expiry = Date.parse(alias.paid_through);
    if (!profile || profile.deleted_at || now >= expiry + GRACE) { removed.push(key); continue; }
    const due = Math.max(expiry - RENEW_BEFORE, alias.renewal_retry_at || 0);
    if (alias.auto_renew && due <= now) {
      const amount = alias.renewal_months * PERSONAL_ALIAS_MONTHLY_CENTS;
      const spender = alias.renewal_spender ? findSpender(profile, alias.renewal_spender) : null;
      if (spender) rollSpend(spender, new Date(now), owner.nextMonthlyReset(new Date(now)));
      if ((!alias.renewal_spender || (spender && spender.scopes?.includes('aliases:purchase') &&
        (!spender.caveats?.cids || spender.caveats.cids.includes(alias.cid)) &&
        (!spender.caveats?.max_retention_months || alias.renewal_months <= spender.caveats.max_retention_months))) &&
        available - total >= amount && (!spender || spendRoomCents(spender) >= amount) &&
        retentionWithinCap(alias.paid_through, alias.renewal_months, new Date(now))) {
        alias.paid_through = advance(Math.max(now, expiry), alias.renewal_months);
        if (spender) recordSpend(spender, amount);
        delete alias.renewal_retry_at;
        renewed.push(alias.name); total += amount; months += alias.renewal_months;
      } else alias.renewal_retry_at = Math.min(now + DAY, expiry + GRACE);
      writes[key] = alias;
    }
    const end = Date.parse(alias.paid_through);
    next = Math.min(next, end + GRACE, alias.auto_renew ? Math.max(end - RENEW_BEFORE, alias.renewal_retry_at || 0) : Infinity);
  }
  if (renewed.length) charge(profile, writes, total, renewed, months, true);
  const receipts = await storage.list({ prefix: RECEIPTS });
  for (const [key, receipt] of await storage.list({ prefix: 'balance-receipt:' })) receipts.set(key, receipt);
  for (const [key, receipt] of await storage.list({ prefix: 'alias-change-receipt:' })) receipts.set(key, receipt);
  for (const [key, receipt] of receipts) {
    // A receipt remains the proof for an unfinished cross-object operation.
    // At most 1,000 unacknowledged alias money operations can be in flight.
    if (receipt.requires_ack && !receipt.consumed) continue;
    if (receipt.until <= now) removed.push(key); else next = Math.min(next, receipt.until);
  }
  if (Object.keys(writes).length || removed.length) {
    await storage.transaction(async txn => {
      for (let i = 0; i < removed.length; i += 128) await txn.delete(removed.slice(i, i + 128));
      const entries = Object.entries(writes);
      for (let i = 0; i < entries.length; i += 128) await txn.put(Object.fromEntries(entries.slice(i, i + 128)));
    });
  }
  return Math.min(next, renewed.length ? now + 1000 : Infinity);
}

/** Count a global repoint once, even if its AliasRecord retries after a crash. */
export async function countAliasChange(owner, data, purchase = false) {
  const now = Date.now(), storage = owner.state.storage;
  const profile = await storage.get('profile');
  if (!profile || profile.deleted_at || profile.aliases_closing) return fail('account_closed', 403);
  const key = `alias-change-receipt:${purchase ? 'purchase:' : ''}${data.request_id}`;
  if (await storage.get(key)) return Response.json({ counted: true });
  const window = purchase ? 'alias-purchases' : 'alias-changes';
  const count = windowCount(await storage.get(window), now);
  if (count >= COST_POLICY.aliasChangesPerDay) return fail('change_limit', 429);
  const until = now + 31 * DAY;
  await scheduleAliasAlarm(owner, until);
  await storage.put({ [window]: { day: Math.floor(now / DAY), count: count + 1 }, [key]: { until } });
  return Response.json({ counted: true });
}
