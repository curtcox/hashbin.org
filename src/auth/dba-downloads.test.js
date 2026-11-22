/**
 * downloads:spend for devicebasedauth.org credentials: signed 256t.us links whose spending
 * identity is the DBA credential, funded under its cap, and refused once it is revoked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbaAuth } from './dba.js';
import { verifyDownloadToken } from './download-tokens.js';
import { generate256tHash } from '../utils/hash256t.js';
import { now, setupDba } from '../../test-utils/dba-fixture.js';

const SECRET = 'download-secret';
let t, cid;
const profile = () => t.env.USER_PROFILES.get('alice');
const lease = (identity, price_uc = 1000000) => profile().fetch(new Request('https://internal/download/lease', {
  method: 'POST', body: JSON.stringify({ identity, cid, price_uc, requests: 1, request_id: crypto.randomUUID() })
}));

async function sign(credential, body = {}) {
  const response = await t.call(await t.dbaRequest(credential, { method: 'POST', path: '/api/downloads/sign', body: { cids: [cid], ...body } }));
  const data = await response.json();
  if (response.status !== 200) return { status: response.status, data };
  const token = new URL(data.urls[0].url).pathname.split('/')[2];
  return { status: 200, data, identity: await verifyDownloadToken(token, SECRET, 'url', 7 * 86400) };
}

beforeEach(async () => {
  t = await setupDba({ env: { DOWNLOAD_TOKEN_SECRET: SECRET } });
  expect((await t.link('alice')).status).toBe(200);
  cid = await generate256tHash(new TextEncoder().encode('hello from a device'));
  const caps = { daily_cap_cents: 500, monthly_cap_cents: 500 };
  expect((await t.call(t.session('/api/downloads/budget', { method: 'PUT', body: JSON.stringify({ account: caps }) }))).status).toBe(200);
});
afterEach(() => vi.unstubAllGlobals());

describe('download links signed with a DBA credential', () => {
  it('spend as the credential, under its cap, and never outlive it', async () => {
    const credential = await t.issue([{ actions: ['hashbin:downloads:spend'], limits: { spend_usd_per_month: 0.02 } }], { exp: now() + 600 });
    const { status, identity } = await sign(credential, { expires_in: 86400 });
    expect(status).toBe(200);
    expect(identity).toMatchObject({ u: 'alice', k: 'crd_CRED000001', kind: 'dba', cid });
    expect(identity.exp).toBeLessThanOrEqual(now() + 600);

    expect(await (await lease(identity)).json()).toMatchObject({ funded: true });
    expect(await (await lease(identity)).json()).toMatchObject({ funded: true });
    // Two cents spent: the grant's $0.02 a month is used up
    expect(await (await lease(identity)).json()).toMatchObject({ funded: false, reason: 'exhausted' });
    const record = (await profile().state.storage.get('profile')).dba_credentials[0];
    expect(record.spend_used_cents).toBe(2);
  });

  it('honour download caps set on the credential by the account', async () => {
    const credential = await t.issue([{ actions: ['hashbin:downloads:spend'] }]);
    const { identity } = await sign(credential);
    const path = '/api/auth/dba/credentials/crd_CRED000001/download-budget';
    const caps = { daily_cap_cents: 1, monthly_cap_cents: 1 };
    const fromDevice = await t.issue([{ actions: ['hashbin:session'] }]);
    expect((await t.call(await t.dbaRequest(fromDevice, { method: 'PUT', path, body: { caps } }))).status).toBe(403);
    expect((await t.call(t.session(path, { method: 'PUT', body: JSON.stringify({ caps }) }))).status).toBe(200);
    expect(await (await lease(identity)).json()).toMatchObject({ funded: true });
    expect(await (await lease(identity)).json()).toMatchObject({ funded: false, reason: 'exhausted' });
  });

  it('stop funding once DBA revokes the credential, or the account is unlinked', async () => {
    const credential = await t.issue([{ actions: ['hashbin:downloads:spend'] }]);
    const { identity } = await sign(credential);
    expect(await (await lease(identity)).json()).toMatchObject({ funded: true });
    t.statusBytes[0] = 1 << 5;
    resetDbaAuth();
    const revoked = await lease(identity);
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ funded: false, reason: 'invalid_identity' });

    t.statusBytes[0] = 0;
    resetDbaAuth();
    const again = await t.issue([{ actions: ['hashbin:downloads:spend'] }], { cid: 'crd_CRED000002', jti: 'crd_CRED000002.1', status: { status_list: { idx: 6, uri: `${'https://dba.test'}/status/1` } } });
    const second = (await sign(again)).identity;
    expect(await (await lease(second)).json()).toMatchObject({ funded: true });
    await t.call(t.session('/api/auth/dba/link', { method: 'DELETE' }));
    expect((await lease(second)).status).toBe(401);
  });

  it('need the downloads:spend grant', async () => {
    const credential = await t.issue([{ actions: ['hashbin:balance:read'] }]);
    expect((await sign(credential)).status).toBe(403);
  });
});
