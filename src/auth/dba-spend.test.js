/**
 * Charges made later through a stored devicebasedauth.org spender (auto-renewals) stop once
 * DBA revokes the credential or the version last presented here expires.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from './middleware.js';
import { resetDbaAuth } from './dba.js';
import { forgetPushedDbaRevocations } from './dba-auth.js';
import { spenderOf } from './scopes.js';
import { storedSpender } from '../utils/credential-spend.js';
import { STATUS_URI, now, setupDba } from '../../test-utils/dba-fixture.js';

let t, spender;
const profile = () => t.env.USER_PROFILES.get('alice');
const debit = (amount, who) => profile().fetch(new Request('https://internal/balance/debit', {
  method: 'POST', body: JSON.stringify({ amount_cents: amount, spender: who, required_scope: 'aliases:purchase' })
}));

beforeEach(async () => {
  t = await setupDba();
  expect((await t.link('alice')).status).toBe(200);
  const credential = await t.issue([{ actions: ['hashbin:aliases:purchase'], limits: { spend_usd_per_month: 5 } }]);
  spender = spenderOf(await authenticate(await t.dbaRequest(credential), t.env));
  expect((await debit(100, spender)).status).toBe(200);
});
afterEach(() => vi.unstubAllGlobals());

describe('stored DBA spenders', () => {
  it('keep only the credential\'s identity, and spend under the recorded cap', async () => {
    expect(storedSpender(spender)).toEqual({ kind: 'dba', id: 'crd_CRED000001', account: 'alice_dba' });
    const record = (await profile().state.storage.get('profile')).dba_credentials[0];
    expect(record).toMatchObject({ credential_id: 'crd_CRED000001', status: { uri: STATUS_URI, idx: 5 }, caveats: { monthly_spend_limit_cents: 500 } });
    expect((await debit(300, storedSpender(spender))).status).toBe(200);
    expect((await (await debit(200, storedSpender(spender))).json()).error).toBe('spending_limit_exceeded');
  });

  it('stop once DBA\'s status list shows the credential revoked', async () => {
    t.statusBytes[0] = 1 << 5;
    resetDbaAuth();
    const response = await debit(100, storedSpender(spender));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_credential');
  });

  it('stop once DBA pushed the revocation to the webhook', async () => {
    const jws = await t.signEvent({ type: 'credentials.revoked', credentials: [{ cid: 'crd_CRED000001', jti: 'crd_CRED000001.1', exp: now() + 3600, revoked_at: now(), status: { idx: 5, uri: STATUS_URI } }] });
    expect((await t.call(new Request('http://localhost:8787/api/dba/events', { method: 'POST', body: jws }))).status).toBe(204);
    forgetPushedDbaRevocations();
    expect((await (await debit(100, storedSpender(spender))).json()).error).toBe('invalid_credential');
  });

  it('stop once the version last presented has expired', async () => {
    const stored = await profile().state.storage.get('profile');
    stored.dba_credentials[0].exp = now() - 1;
    await profile().state.storage.put('profile', stored);
    expect((await (await debit(100, storedSpender(spender))).json()).error).toBe('invalid_credential');
    // Presenting the (renewed) credential again brings it back
    expect((await debit(100, { ...spender, exp: now() + 3600 })).status).toBe(200);
  });

  it('wait rather than charge while DBA cannot be reached', async () => {
    resetDbaAuth();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
    const response = await debit(100, storedSpender(spender));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('dba_unavailable');
  });
});
