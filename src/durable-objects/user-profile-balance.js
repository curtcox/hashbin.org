/**
 * UserProfile methods for the balance: reads, deposits, debits and retry receipts. Installed
 * on UserProfile.prototype (user-profile.js), so `this` is the Durable Object.
 */
import { findSpender, recordSpend, rollSpend, spendRoomCents } from '../utils/credential-spend.js';
import { checkStoredDbaSpender } from './dba-spend-check.js';
import { checkCaveats } from '../auth/scopes.js';
import { COST_POLICY } from '../utils/cost-policy.js';
import { stageDownloadOutbox } from './download-outbox.js';


export const balanceMethods = {
  /**
   * Get balance information
   */
  async getBalance() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        balance_cents: profile.balance_cents || 0,
        total_deposited_cents: profile.total_deposited_cents || 0,
        total_spent_cents: profile.total_spent_cents || 0
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  },
  /**
   * Deposit to balance (credit)
   * This should only be called after successful Stripe payment
   */
  async depositBalance(data) {
    const retry = await this.balanceRetry(data, 'credit');
    if (retry) return retry;
    const profile = await this.state.storage.get('profile');
    if (data.alias_origin && (profile?.alias_move_to || profile?.migrated_to)) {
      if (!profile.migrated_to) return Response.json({ error: 'account_moving' }, { status: 503 });
      return this.env.USER_PROFILES.get(this.env.USER_PROFILES.idFromName(profile.migrated_to))
        .fetch(new Request('https://internal/balance/deposit', { method: 'POST', body: JSON.stringify(data) }));
    }

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const amount_cents = data.amount_cents;
    if (!Number.isSafeInteger(amount_cents) || amount_cents <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const balance_before = profile.balance_cents || 0;
    const balance_after = balance_before + amount_cents;

    profile.balance_cents = balance_after;
    if (data.credit_type === 'alias_offer_return') profile.total_spent_cents = Math.max(0, (profile.total_spent_cents || 0) - amount_cents);
    else if (data.credit_type === 'alias_sale') {
      profile.alias_sale_proceeds_cents = (profile.alias_sale_proceeds_cents || 0) + amount_cents;
      const day = data.sale_day;
      const days = profile.alias_daily_sales ||= {};
      const before = days[day] || 0;
      days[day] = before + data.sale_price_cents;
      const cutoff = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);
      for (const key of Object.keys(days)) if (key < cutoff) delete days[key];
      if (before <= COST_POLICY.aliasSalesAlertDailyCents && before + data.sale_price_cents > COST_POLICY.aliasSalesAlertDailyCents) {
        profile.download_event_sequence = (profile.download_event_sequence || 0) + 1;
        (profile.download_outbox ||= []).push({ sequence: profile.download_event_sequence, alert: {
          type: `alias_sales:${profile.user_id}:${day}`, severity: 'warning', title: 'Daily alias sales exceed $50',
          message: `Account ${profile.user_id} sold more than $50 of aliases on ${day}. Review deposits and sale activity.`,
          metadata: { user_id: profile.user_id, day, gross_cents: before + data.sale_price_cents }
        } });
      }
    } else profile.total_deposited_cents = (profile.total_deposited_cents || 0) + amount_cents;
    // A refund of a key's or app's debit also returns its monthly spending room
    const spender = data.spender ? findSpender(profile, data.spender) : null;
    if (spender && (data.spend_reset === undefined || spender.spend_reset === data.spend_reset)) recordSpend(spender, -amount_cents);
    profile.updated_at = new Date().toISOString();

    const result = { balance_before_cents: balance_before, balance_after_cents: balance_after, amount_cents };
    await this.saveBalanceReceipt(profile, data, 'credit', result);

    return new Response(
      JSON.stringify({
        balance_before_cents: balance_before,
        balance_after_cents: balance_after,
        amount_cents: amount_cents
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  },
  /**
   * Debit from balance (payment)
   * Returns error if insufficient balance
   */
  async debitBalance(data) {
    const retry = await this.balanceRetry(data, 'debit');
    if (retry) return retry;
    const profile = await this.state.storage.get('profile');
    if (profile?.deleted_at || (data.required_scope === 'aliases:purchase' && profile?.aliases_closing)) {
      return Response.json({ error: 'account_closed' }, { status: 403 });
    }

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    this.normalizeOAuthCollections(profile);
    const amount_cents = data.amount_cents;
    if (!Number.isSafeInteger(amount_cents) || amount_cents <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // A key or app grant spends within its own monthly limit
    if (!await checkStoredDbaSpender(this.env, profile, data.spender)) {
      return Response.json({ error: 'dba_unavailable', message: 'Could not check the devicebasedauth.org credential; retry' }, { status: 503 });
    }
    const spender = data.spender ? findSpender(profile, data.spender) : null;
    if (data.spender && !spender) {
      return Response.json({ error: 'invalid_credential', message: 'The key or app authorization is no longer valid' }, { status: 400 });
    }
    if (spender) {
      if (data.required_scope && !spender.scopes?.includes(data.required_scope)) return Response.json({ error: 'insufficient_scope' }, { status: 403 });
      const denied = checkCaveats({ user: { caveats: spender.caveats } }, data.context || {});
      if (denied) return denied;
      rollSpend(spender, new Date(), this.nextMonthlyReset());
      if (amount_cents > spendRoomCents(spender)) {
        return Response.json({
          error: 'spending_limit_exceeded',
          message: 'This would exceed the monthly spending limit set for this key or app'
        }, { status: 400 });
      }
    }

    const balance_before = profile.balance_cents || 0;
    
    // Check for sufficient balance
    if (balance_before < amount_cents) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_balance',
          message: 'Insufficient balance for this transaction',
          balance_cents: balance_before,
          required_cents: amount_cents,
          shortfall_cents: amount_cents - balance_before
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const balance_after = balance_before - amount_cents;

    profile.balance_cents = balance_after;
    profile.total_spent_cents = (profile.total_spent_cents || 0) + amount_cents;
    if (spender) {
      const before = spender.spend_used_cents || 0;
      recordSpend(spender, amount_cents);
      const limit = spender.caveats?.monthly_spend_limit_cents;
      if (spender.grant_id && limit && before < limit * 0.8 && spender.spend_used_cents >= limit * 0.8) {
        this.securityEvent(profile, 'grant_spend_80_percent', spender.grant_id);
      }
    }
    profile.updated_at = new Date().toISOString();

    const result = { balance_before_cents: balance_before, balance_after_cents: balance_after, amount_cents,
      ...(data.required_scope ? { spend_reset: spender?.spend_reset || null } : {}) };
    await this.saveBalanceReceipt(profile, data, 'debit', result);

    return new Response(
      JSON.stringify({
        balance_before_cents: balance_before,
        balance_after_cents: balance_after,
        amount_cents: amount_cents,
        ...(data.required_scope ? { spend_reset: result.spend_reset } : {})
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  },
  async balanceRetry(data, direction) {
    if (data.request_id === undefined) return null;
    if (typeof data.request_id !== 'string' || !/^[A-Za-z0-9:_-]{1,256}$/.test(data.request_id) ||
      (data.request_created_at !== undefined && (!Number.isFinite(data.request_created_at) || data.request_created_at > Date.now() + 60000))) {
      return Response.json({ error: 'invalid_request_id' }, { status: 400 });
    }
    const receipt = await this.state.storage.get(`balance-receipt:${data.request_id}`);
    if (receipt?.cancelled) return Response.json({ error: 'operation_cancelled' }, { status: 409 });
    const fingerprint = JSON.stringify([direction, data.amount_cents, data.spender || null]);
    if (receipt) return receipt.fingerprint === fingerprint ? Response.json({ ...receipt.result, consumed: receipt.consumed || false })
      : Response.json({ error: 'request_id_conflict' }, { status: 409 });
    const acknowledged = data.required_scope === 'aliases:purchase' || data.alias_origin;
    if (acknowledged) {
      const profile = await this.state.storage.get('profile');
      if ((profile?.alias_receipts_pending || 0) >= 1000) return Response.json({ error: 'receipt_capacity' }, { status: 503 });
    } else if (Date.now() - data.request_created_at >= 31 * 86400000) return Response.json({ error: 'request_id_expired' }, { status: 409 });
    return null;
  },
  async saveBalanceReceipt(profile, data, direction, result) {
    if (!data.request_id) return this.state.storage.put('profile', profile);
    const until = (data.request_created_at ?? Date.now()) + 31 * 86400000;
    const requiresAck = Boolean(data.required_scope === 'aliases:purchase' || data.alias_origin);
    if (requiresAck) profile.alias_receipts_pending = (profile.alias_receipts_pending || 0) + 1;
    const pending = await this.state.storage.getAlarm();
    if (pending === null || pending > until) await this.state.storage.setAlarm(until);
    const entries = { profile, [`balance-receipt:${data.request_id}`]: {
      fingerprint: JSON.stringify([direction, data.amount_cents, data.spender || null]), result, until, requires_ack: requiresAck
    }, ...(data.alias_index ? { [`${data.alias_index.kind === 'offer' ? 'alias-offer' : 'global-alias'}:${data.alias_index.name}`]: { name: data.alias_index.name } } : {}) };
    stageDownloadOutbox(profile, entries);
    if (profile.download_outbox_pending) {
      const alarm = await this.state.storage.getAlarm();
      if (alarm === null || alarm > Date.now() + 1000) await this.state.storage.setAlarm(Date.now() + 1000);
    }
    await this.state.storage.put(entries);
  },
};
