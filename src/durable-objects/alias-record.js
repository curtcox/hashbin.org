import { normalizeAliasName, isReservedAlias, validateAliasCid } from '../utils/alias-names.js';
import { GLOBAL_ALIAS_YEARLY_CENTS, ALIAS_SALE_FEE_RATE, ALIAS_SALE_MINIMUM_FEE_CENTS, aliasSaleFee } from '../utils/pricing.js';
import { retentionWithinCap } from '../utils/cost-policy.js';
import { handleBackupRequest, registerForBackup } from '../utils/backup.js';

const DAY = 86400000;
const GRACE = 30 * DAY;
const OUTBOX = 'outbox:';
const PENDING_EVENTS = 'pending-event:';
const error = (code, status = 400) => Object.assign(new Error(code), { status });
const post = (path, body) => new Request(`https://internal${path}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });

function publicRecord(record, name) {
  const status = record?.suspended ? 'suspended' : record?.owner_id
    ? Date.parse(record.paid_through) <= Date.now() ? 'expired' : 'owned' : isReservedAlias(name) ? 'reserved' : 'free';
  return { name, status, cid: record?.cid || null, paid_through: record?.paid_through || null,
    listing_price_cents: status === 'owned' ? record.listing_price_cents || null : null,
    history: record?.history || [], yearly_price_cents: GLOBAL_ALIAS_YEARLY_CENTS,
    sale_fee_rate: ALIAS_SALE_FEE_RATE, minimum_sale_fee_cents: ALIAS_SALE_MINIMUM_FEE_CENTS };
}

/** One serialized authority per global name; pending debits and all effects are durable. */
export class AliasRecord {
  constructor(state, env) { this.state = state; this.env = env; this.queue = Promise.resolve(); }

  async fetch(request) {
    const task = this.queue.then(async () => {
      const backup = await handleBackupRequest(this.state, request);
      if (backup) {
        if (request.method === 'POST' && backup.ok) await this.state.storage.setAlarm(Date.now() + 1000);
        return backup;
      }
      try {
        const data = await request.json();
        const name = normalizeAliasName(data.name);
        if (!name) throw error('invalid_name');
        const storedName = await this.state.storage.get('name');
        if (storedName && storedName !== name) throw error('invalid_name');
        await this.flushOutbox();
        await this.finishPending();
        await this.maintain();
        const action = new URL(request.url).pathname.slice(1);
        const response = await this.perform(action, { ...data, name });
        await this.flushOutbox();
        return response;
      } catch (cause) {
        const headers = { 'Cache-Control': 'private, no-store' };
        if (cause.status === 429) headers['Retry-After'] = String(Math.ceil((DAY - Date.now() % DAY) / 1000));
        return Response.json({ error: cause.status ? cause.message : 'alias_unavailable' }, { status: cause.status || 503, headers });
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async alarm() {
    const task = this.queue.then(async () => {
      try { await this.flushOutbox(); await this.finishPending(); await this.maintain(); await this.flushOutbox(); }
      catch (cause) { console.error('Alias retry', cause.message); await this.state.storage.setAlarm(Date.now() + 60000); }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async profile(userId, path, body) {
    const response = await this.env.USER_PROFILES.get(this.env.USER_PROFILES.idFromName(userId)).fetch(post(path, body));
    if (!response.ok) {
      let code = 'profile_unavailable';
      try { code = (await response.json()).error || code; } catch { /* Preserve the status when the response is not JSON. */ }
      throw error(code, response.status);
    }
    return response.json();
  }

  event(record, events, body) {
    record.sequence = (record.sequence || 0) + 1;
    events.push({ id: crypto.randomUUID(), name: record.name, generation: record.generation,
      sequence: record.sequence, period: new Date().toISOString().slice(0, 7), created_at: Date.now(), ...body });
  }

  index(record, events, userId, remove = false, kind = 'global', value = undefined) {
    this.event(record, events, { kind: 'index', user_id: userId, body: { name: record.name, kind, remove,
      value: remove ? undefined : value || { ...publicRecord(record, record.name), auto_renew: record.auto_renew,
        incoming_offers: (record.offers || []).length } } });
  }

  returnOffer(record, events, offer) {
    this.event(record, events, { kind: 'credit', user_id: offer.buyer_id, amount_cents: offer.amount_cents,
      spender: offer.spender, spend_reset: offer.spend_reset, transaction: { type: 'alias_offer_return', amount_cents: offer.amount_cents,
        alias_names: [record.name], price_cents: offer.amount_cents } });
    this.index(record, events, offer.buyer_id, true, 'offer');
  }

  history(record, entry) {
    record.history = [...(record.history || []), { time: new Date().toISOString(), ...entry }].slice(-100);
  }

  async perform(action, data) {
    const storage = this.state.storage, now = Date.now(), name = data.name;
    const current = await storage.get('alias');
    if (!current && ['delete-user', 'move-owner'].includes(action) && data.admin) return Response.json({ updated: true });
    if (action === 'settle' && data.admin) {
      await this.flushOutbox();
      if ((await storage.list({ prefix: OUTBOX, limit: 1 })).size) throw error('accounting_pending', 503);
      return Response.json({ settled: true });
    }
    if (action === 'info' || action === 'resolve') {
      const info = publicRecord(current, name);
      if (action === 'info') return Response.json({ ...info, is_owner: Boolean(data.user_id && data.user_id === current?.owner_id),
        ...(current?.owner_id && data.user_id === current.owner_id ? { auto_renew: current.auto_renew } : {}) });
      const status = info.status === 'owned' ? 200 : info.status === 'expired' ? 410 : info.status === 'suspended' ? 451 : 404;
      return Response.json(status === 200 ? { cid: current.cid, source: 'global', paid_through: current.paid_through } :
        { error: status === 410 ? 'alias_expired' : status === 451 ? 'alias_suspended' : 'alias_not_found' }, { status });
    }
    if (action === 'offers-list') {
      if (current?.owner_id !== data.user_id) throw error('not_owner', 403);
      // Buyers' account IDs are never disclosed, including to the seller.
      return Response.json({ offers: (current.offers || []).map(({ buyer_id: _buyer, spender: _spender, ...offer }) => offer) });
    }
    const requestId = data.request_id || crypto.randomUUID();
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) throw error('invalid_request_id');
    const receiptKey = `receipt:${requestId}`;
    const fingerprint = JSON.stringify([action, { ...data, request_id: undefined }]);
    const prior = await storage.get(receiptKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw error('request_id_conflict', 409);
      return Response.json(prior.result, { status: prior.status });
    }
    if (!data.user_id && !data.admin) throw error('Unauthorized', 401);
    if (!data.admin) await this.profile(data.user_id, '/aliases/can-act', {});
    if (current?.release_pending) throw error('alias_releasing', 409);
    if (isReservedAlias(name) && !data.admin && !current?.owner_id) throw error('reserved_name', 403);
    const record = structuredClone(current || { name, generation: crypto.randomUUID(), sequence: 0, history: [], offers: [] });
    const events = [];
    let debit, transaction, result, status = 200, ownerIndexed = false;
    const owner = () => { if (!record.owner_id || record.owner_id !== data.user_id) throw error('not_owner', 403); };
    const active = () => {
      if (record.suspended) throw error('alias_suspended', 451);
      if (!record.owner_id) throw error('alias_not_found', 404);
      if (Date.parse(record.paid_through) <= now) throw error('alias_expired', 410);
    };
    const allowedCid = cid => {
      if (data.caveats?.cids && !data.caveats.cids.includes(cid)) throw error('caveat_violation', 403);
    };
    const buyTerm = claim => {
      const years = data.years ?? 1;
      if (!Number.isSafeInteger(years) || years < 1 || years > 10) throw error('invalid_years');
      if (data.caveats?.max_retention_months && years * 12 > data.caveats.max_retention_months) throw error('caveat_violation', 403);
      if (!retentionWithinCap(claim ? null : record.paid_through, years * 12)) throw error('retention_limit');
      const end = new Date(Math.max(now, claim ? now : Date.parse(record.paid_through)));
      end.setUTCFullYear(end.getUTCFullYear() + years);
      record.paid_through = end.toISOString(); record.renewal_years = years; record.renewal_spender = data.spender || null;
      delete record.renewal_retry_at;
      debit = { user_id: data.user_id, amount_cents: years * GLOBAL_ALIAS_YEARLY_CENTS, spender: data.spender,
        context: { cid: record.cid, retention_months: years * 12 } };
      transaction = { type: claim ? 'alias_registration' : 'alias_renewal', alias_names: [name], alias_months: years * 12 };
      this.event(record, events, { kind: 'revenue', revenue_cents: debit.amount_cents });
    };
    const sell = (buyer, amount, accepted) => {
      const seller = record.owner_id, fee = aliasSaleFee(amount);
      if (buyer === seller) throw error('self_purchase');
      const returns = (record.offers || []).filter(offer => offer.id !== accepted?.id);
      if (accepted) {
        this.index(record, events, buyer, true, 'offer');
        this.event(record, events, { kind: 'transaction', user_id: buyer, transaction: { type: 'alias_purchase', amount_cents: 0,
          alias_names: [name], price_cents: amount, from_offer: true } });
      }
      this.event(record, events, { kind: 'credit', user_id: seller, amount_cents: amount - fee,
        transaction: { type: 'alias_sale', amount_cents: amount - fee, price_cents: amount, fee_cents: fee, alias_names: [name] } });
      this.event(record, events, { kind: 'revenue', revenue_cents: fee });
      this.index(record, events, seller, true);
      record.owner_id = buyer; record.listing_price_cents = null; record.offers = [];
      record.auto_renew = false; record.renewal_spender = null;
      this.history(record, { type: 'ownership', price_cents: amount });
      this.index(record, events, buyer); ownerIndexed = true;
      for (const offer of returns) this.returnOffer(record, events, offer);
    };

    if (action === 'claim') {
      if (record.owner_id) throw error('name_taken', 409);
      if (!validateAliasCid(data.cid)) throw error('invalid_cid');
      allowedCid(data.cid);
      record.owner_id = data.user_id; record.cid = data.cid; record.auto_renew = false;
      buyTerm(true); this.history(record, { type: 'ownership', price_cents: debit.amount_cents });
      this.history(record, { type: 'value', cid: data.cid }); status = 201;
    } else if (action === 'renew') {
      owner(); if (record.suspended) throw error('alias_suspended', 451);
      allowedCid(record.cid); buyTerm(false);
    } else if (action === 'value') {
      owner(); active(); allowedCid(record.cid); allowedCid(data.cid);
      if (!validateAliasCid(data.cid)) throw error('invalid_cid');
      record.cid = data.cid; this.history(record, { type: 'value', cid: data.cid });
    } else if (action === 'settings') {
      owner(); active(); allowedCid(record.cid);
      if (typeof data.auto_renew !== 'boolean') throw error('invalid_auto_renew');
      record.auto_renew = data.auto_renew;
      if (data.auto_renew) record.renewal_spender = data.spender || null;
    } else if (action === 'listing' || action === 'unlist') {
      owner(); active(); allowedCid(record.cid);
      if (action === 'listing' && (!Number.isSafeInteger(data.price_cents) || data.price_cents < 100 || data.price_cents > 100000000)) throw error('invalid_price');
      record.listing_price_cents = action === 'listing' ? data.price_cents : null;
    } else if (action === 'buy') {
      active(); allowedCid(record.cid);
      if (!record.listing_price_cents || data.price_cents !== record.listing_price_cents) throw error('price_changed', 409);
      debit = { user_id: data.user_id, amount_cents: data.price_cents, spender: data.spender, context: { cid: record.cid } };
      transaction = { type: 'alias_purchase', price_cents: data.price_cents, alias_names: [name] };
      sell(data.user_id, data.price_cents);
    } else if (action === 'offer') {
      active(); allowedCid(record.cid);
      if (record.owner_id === data.user_id) throw error('self_purchase');
      if ((record.offers || []).some(o => o.buyer_id === data.user_id)) throw error('offer_exists', 409);
      if (record.offers.length >= 100) throw error('offer_limit', 409);
      const days = data.expires_in_days ?? 7;
      if (!Number.isSafeInteger(days) || days < 1 || days > 30) throw error('invalid_offer_expiry');
      if (!Number.isSafeInteger(data.amount_cents) || data.amount_cents < 100 || data.amount_cents > 100000000) throw error('invalid_price');
      const offer = { id: crypto.randomUUID(), buyer_id: data.user_id, amount_cents: data.amount_cents,
        expires_at: Math.min(now + days * DAY, Date.parse(record.paid_through)), spender: data.spender || null };
      record.offers.push(offer);
      debit = { user_id: data.user_id, amount_cents: offer.amount_cents, spender: data.spender, context: { cid: record.cid } };
      transaction = { type: 'alias_offer_hold', alias_names: [name], price_cents: offer.amount_cents };
      this.index(record, events, data.user_id, false, 'offer', { id: offer.id, amount_cents: offer.amount_cents, expires_at: offer.expires_at });
      result = { offer_id: offer.id }; status = 201;
    } else if (['withdraw', 'accept', 'decline'].includes(action)) {
      const offer = record.offers.find(o => o.id === data.offer_id);
      if (!offer) throw error('offer_not_found', 404);
      if (action === 'withdraw') { if (offer.buyer_id !== data.user_id) throw error('not_owner', 403); }
      else { owner(); active(); }
      allowedCid(record.cid);
      if (action === 'accept') sell(offer.buyer_id, offer.amount_cents, offer);
      else {
        this.returnOffer(record, events, offer);
        record.offers = record.offers.filter(o => o.id !== offer.id);
      }
    } else if (['suspend', 'restore', 'reclaim', 'assign', 'move-owner', 'delete-user'].includes(action)) {
      if (!data.admin) throw error('not_admin', 403);
      if (action === 'suspend' || action === 'reclaim') {
        for (const offer of record.offers) this.returnOffer(record, events, offer);
        record.offers = []; record.listing_price_cents = null;
        record.suspended = true;
        if (action === 'reclaim') {
          if (record.owner_id) this.index(record, events, record.owner_id, true);
          delete record.owner_id; delete record.cid; delete record.paid_through; record.history = [];
        }
      } else if (action === 'restore') record.suspended = false;
      else if (action === 'assign') {
        if (typeof data.owner_id !== 'string' || !data.owner_id || data.owner_id.length > 256 || !validateAliasCid(data.cid)) throw error('invalid_assignment');
        if (record.owner_id && record.owner_id !== data.owner_id) this.index(record, events, record.owner_id, true);
        for (const offer of record.offers) this.returnOffer(record, events, offer);
        record.offers = []; record.listing_price_cents = null; record.owner_id = data.owner_id;
        record.cid = data.cid; record.suspended = false; record.auto_renew = false;
        record.paid_through = new Date(now + 365 * DAY).toISOString(); record.renewal_years = 1; record.renewal_spender = null;
        this.history(record, { type: 'ownership', price_cents: 0 }); this.history(record, { type: 'value', cid: data.cid });
      } else if (action === 'move-owner') {
        if (record.owner_id === data.from) { record.owner_id = data.to; record.auto_renew = false; record.renewal_spender = null; this.index(record, events, data.from, true); }
        for (const offer of record.offers) if (offer.buyer_id === data.from) {
          this.index(record, events, data.from, true, 'offer'); offer.buyer_id = data.to; offer.spender = null;
          this.index(record, events, data.to, false, 'offer', { id: offer.id, amount_cents: offer.amount_cents, expires_at: offer.expires_at });
        }
      } else if (action === 'delete-user') {
        if (record.owner_id === data.target_user_id) {
          for (const offer of record.offers) this.returnOffer(record, events, offer);
          this.index(record, events, record.owner_id, true);
          record.offers = []; delete record.owner_id; record.release_pending = true;
        } else {
          for (const offer of record.offers.filter(o => o.buyer_id === data.target_user_id)) this.returnOffer(record, events, offer);
          record.offers = record.offers.filter(o => o.buyer_id !== data.target_user_id);
        }
      }
    } else throw error('Not found', 404);

    if (record.owner_id && !ownerIndexed) this.index(record, events, record.owner_id);
    result = { ...publicRecord(record, name), ...result, auto_renew: record.auto_renew || false,
      ...(debit ? { charged_cents: debit.amount_cents } : {}) };
    const operation = { record, debit, transaction, receiptKey, fingerprint, result, status, created_at: now,
      money_id: `alias:${name}:${requestId}`, change_user: ['value', 'settings', 'listing', 'unlist'].includes(action) ? data.user_id : null,
      alias_index: debit ? { name, kind: action === 'offer' ? 'offer' : 'global' } : null };
    // Recoverable intent must be on disk before any other object's balance changes.
    await storage.setAlarm(now + 1000);
    const prepared = { name, pending: operation };
    for (const item of events) prepared[`${PENDING_EVENTS}${String(item.sequence).padStart(16, '0')}`] = item;
    await storage.transaction(async txn => {
      const pairs = Object.entries(prepared);
      for (let i = 0; i < pairs.length; i += 128) await txn.put(Object.fromEntries(pairs.slice(i, i + 128)));
    });
    await this.finishPending(true);
    return Response.json(result, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }

  async finishPending(fresh = false) {
    const storage = this.state.storage;
    const pending = await storage.get('pending');
    if (!pending) return;
    let balance;
    try {
      if (pending.change_user) await this.profile(pending.change_user, '/aliases/count-change', { request_id: pending.money_id });
      if (pending.debit) {
        const receipt = await this.profile(pending.debit.user_id, '/balance/receipt', {
          request_id: pending.money_id, cancel_if_missing: !fresh
        });
        if (receipt?.cancelled) throw error('operation_cancelled', 409);
        if (!receipt) await this.profile(pending.debit.user_id, '/aliases/purchase-limit', { request_id: pending.money_id });
        balance = await this.profile(pending.debit.user_id, '/balance/debit', { ...pending.debit,
          alias_index: pending.alias_index, required_scope: 'aliases:purchase', request_id: pending.money_id, request_created_at: pending.created_at });
        if (balance.consumed) throw error('request_id_conflict', 409);
      }
    } catch (cause) {
      // A transport/5xx failure has an unknown outcome. Keep the intent for retry.
      if (cause.status && cause.status < 500) {
        const discarded = [...(await storage.list({ prefix: PENDING_EVENTS })).keys(), 'pending'];
        await storage.transaction(async txn => {
          for (let i = 0; i < discarded.length; i += 128) await txn.delete(discarded.slice(i, i + 128));
        });
        if (!await storage.get('alias') && !(await storage.list({ prefix: OUTBOX, limit: 1 })).size) await storage.deleteAll();
      }
      throw cause;
    }
    const staged = await storage.list({ prefix: PENDING_EVENTS });
    const record = pending.record, events = [...staged.values()];
    if (pending.debit) {
      if (pending.transaction.type === 'alias_offer_hold') {
        const offer = record.offers.find(o => o.buyer_id === pending.debit.user_id);
        if (offer) offer.spend_reset = balance.spend_reset;
      }
      this.event(record, events, { kind: 'ack', user_id: pending.debit.user_id, request_id: pending.money_id });
      this.event(record, events, { kind: 'transaction', user_id: pending.debit.user_id,
        transaction: { ...pending.transaction, ...balance, amount_cents: pending.debit.amount_cents } });
    }
    const entries = { alias: record, [pending.receiptKey]: { fingerprint: pending.fingerprint,
      result: pending.result, status: pending.status, until: pending.created_at + 31 * DAY } };
    for (const item of events) entries[`${OUTBOX}${String(item.sequence).padStart(16, '0')}`] = item;
    await storage.transaction(async txn => {
      const pairs = Object.entries(entries);
      for (let i = 0; i < pairs.length; i += 128) await txn.put(Object.fromEntries(pairs.slice(i, i + 128)));
      await txn.delete('pending');
      const stagedKeys = [...staged.keys()];
      for (let i = 0; i < stagedKeys.length; i += 128) await txn.delete(stagedKeys.slice(i, i + 128));
    });
    await registerForBackup(this.state, this.env, 'ALIAS_RECORDS', `alias:${record.name}`);
  }

  async flushOutbox() {
    const storage = this.state.storage;
    const rows = await storage.list({ prefix: OUTBOX, limit: 16 });
    const started = Date.now(); let delivered = 0;
    for (const [key, item] of rows) {
      if (delivered && Date.now() - started >= 1000) break;
      try {
        if (item.kind === 'index') await this.profile(item.user_id, '/aliases/index', item.body);
        else if (item.kind === 'ack') await this.profile(item.user_id, '/balance/ack', { request_id: item.request_id });
        else if (item.kind === 'credit-ack') await this.profile(item.user_id, '/balance/ack', { request_id: `alias-event:${item.id}` });
        else if (item.kind === 'credit') {
          const balance = await this.profile(item.user_id, '/balance/deposit', { amount_cents: item.amount_cents, spender: item.spender, spend_reset: item.spend_reset,
            credit_type: item.transaction.type, sale_price_cents: item.transaction.price_cents,
            sale_day: new Date(item.created_at).toISOString().slice(0, 10),
            alias_origin: true, request_id: `alias-event:${item.id}`, request_created_at: item.created_at });
          await this.deliverTransaction(item, { ...item.transaction, ...balance });
          // Advance the durable source before acknowledging its credit receipt.
          // Even a long outage between these steps cannot credit the balance twice.
          await storage.put(key, { ...item, kind: 'credit-ack' });
          await this.profile(item.user_id, '/balance/ack', { request_id: `alias-event:${item.id}` });
        } else if (item.kind === 'transaction') await this.deliverTransaction(item, item.transaction);
        else if (item.kind === 'revenue') {
          const response = await this.env.PLATFORM_STATS.get(this.env.PLATFORM_STATS.idFromName('global')).fetch(post('/alias-revenue', {
            id: item.id, user_id: `alias:${item.name}:${item.generation}`, sequence: item.sequence, period: item.period, revenue_cents: item.revenue_cents
          }));
          if (!response.ok) throw new Error('Alias revenue unavailable');
        }
        await storage.delete(key);
        delivered++;
      } catch (cause) { console.warn('Alias outbox retry', cause.message); break; }
    }
    await this.schedule();
  }

  async deliverTransaction(item, transaction) {
    const response = await this.env.PAYMENT_RECORDS.get(this.env.PAYMENT_RECORDS.idFromName(item.user_id)).fetch(post('/transaction', {
      ...transaction, user_id: item.user_id, transaction_id: item.id
    }));
    if (!response.ok) throw new Error('Alias transaction unavailable');
  }

  async maintain() {
    const storage = this.state.storage, now = Date.now();
    const record = await storage.get('alias');
    if (!record) return;
    const events = [];
    const expired = Date.parse(record.paid_through) <= now;
    const expiredOffers = record.offers.filter(o => expired || record.suspended || o.expires_at <= now);
    for (const offer of expiredOffers) this.returnOffer(record, events, offer);
    record.offers = record.offers.filter(o => !expiredOffers.includes(o));
    if (expired) record.listing_price_cents = null;
    const renewalDue = record.owner_id && !record.suspended && record.auto_renew &&
      Math.max(Date.parse(record.paid_through) - 7 * DAY, record.renewal_retry_at || 0) <= now &&
      Date.parse(record.paid_through) + GRACE > now;
    if (record.owner_id && now >= Date.parse(record.paid_through) + GRACE) {
      this.index(record, events, record.owner_id, true);
      delete record.owner_id;
      if (record.suspended) { delete record.cid; delete record.paid_through; record.history = []; }
      else record.release_pending = true;
    } else if (events.length && record.owner_id) this.index(record, events, record.owner_id);
    const entries = { alias: record };
    for (const item of events) entries[`${OUTBOX}${String(item.sequence).padStart(16, '0')}`] = item;
    // No storage write for ordinary reads of an unchanged record.
    if (events.length || (expired && !record.lapsed) || record.renewal_retry_at) {
      if (expired) record.lapsed = true;
      entries.alias = record;
      await storage.transaction(async txn => {
        const pairs = Object.entries(entries);
        for (let i = 0; i < pairs.length; i += 128) await txn.put(Object.fromEntries(pairs.slice(i, i + 128)));
      });
    }
    for (const [key, receipt] of await storage.list({ prefix: 'receipt:' })) if (receipt.until <= now) await storage.delete(key);
    if (renewalDue) {
      try {
        await this.perform('renew', { name: record.name, user_id: record.owner_id, years: record.renewal_years || 1,
          spender: record.renewal_spender, request_id: `auto-${Date.parse(record.paid_through)}` });
      } catch (cause) {
        if (!cause.status || cause.status >= 500) throw cause;
        record.renewal_retry_at = Math.min(now + DAY, Date.parse(record.paid_through) + GRACE);
        await storage.put('alias', record);
      }
    }
  }

  async schedule() {
    const storage = this.state.storage, now = Date.now();
    if ((await storage.list({ prefix: OUTBOX, limit: 1 })).size || await storage.get('pending')) {
      await storage.setAlarm(now + 1000); return;
    }
    const record = await storage.get('alias');
    if (!record) return;
    if (record.release_pending) { await storage.deleteAll(); return; }
    let next = Infinity;
    if (record.owner_id) {
      const expiry = Date.parse(record.paid_through);
      next = expiry > now ? expiry : expiry + GRACE;
      if (record.auto_renew && !record.suspended) next = Math.min(next, Math.max(expiry - 7 * DAY, record.renewal_retry_at || 0));
    }
    for (const offer of record.offers) next = Math.min(next, offer.expires_at);
    for (const receipt of (await storage.list({ prefix: 'receipt:' })).values()) next = Math.min(next, receipt.until);
    if (Number.isFinite(next)) await storage.setAlarm(Math.max(now + 1000, next));
  }
}
