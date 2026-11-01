import { it, expect } from 'vitest';
import { aliasFixture } from '../../test-utils/alias-fixture.js';
import { handleCreateDispute, handleGetAliasDisputes } from './disputes.js';
import { handleAdminUpdateDispute } from './admin-disputes.js';
import { handleUserAliases, handleResolveAlias } from './aliases.js';
import { generate256tHash } from '../utils/hash256t.js';

it('routes alias reports through dispute records and suspends the name without touching content', async () => {
  const f = aliasFixture(), cid = await generate256tHash(new Uint8Array([1]));
  await f.global('document', 'claim', { cid });
  const report = await handleCreateDispute(new Request('https://hashbin.org/api/disputes', { method: 'POST', body: JSON.stringify({
    target_type: 'alias', name: 'document', claim_type: 'impersonation', evidence: 'An alias impersonation report with enough supporting detail for administrator review.',
    contact: { type: 'email', value: 'test@example.com' }
  }) }), f.env);
  expect(report.status).toBe(201);
  const publicHistory = await (await handleGetAliasDisputes(new Request('https://hashbin.org/api/aliases/document/disputes'), f.env, ['', 'document'])).json();
  expect(publicHistory.disputes).toHaveLength(1);
  expect(publicHistory.disputes[0].submitter_contact).toBeUndefined();
  const request = new Request('https://hashbin.org/api/admin/disputes/%40document', { method: 'PATCH', body: JSON.stringify({ status: 'closed_deleted' }) });
  request.auth = { authenticated: true, user: { userId: 'admin', session: true, scopes: ['admin:disputes', 'admin:takedown'] } };
  request.user = request.auth.user;
  expect((await handleAdminUpdateDispute(request, f.env, '%40document')).ok).toBe(true);
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(451);
});

it('keeps private API resolution behind read scope and enforces CID caveats on lists and writes', async () => {
  const f = aliasFixture(), cid = await generate256tHash(new Uint8Array([1]));
  await f.personal('user', '/personal', { name: 'document', cid });
  const request = new Request('https://hashbin.org/api/aliases/document/resolve');
  request.auth = { authenticated: true, user: { userId: 'user', authMethod: 'apikey', scopes: ['balance:read'] } };
  expect((await handleResolveAlias(request, f.env, ['', 'document'])).status).toBe(403);
  request.auth.user.scopes = ['aliases:read'];
  expect((await (await handleResolveAlias(request, f.env, ['', 'document'])).json()).source).toBe('personal');
  request.auth.user.caveats = { cids: [] };
  expect((await handleResolveAlias(request, f.env, ['', 'document'])).status).toBe(403);
  const list = new Request('https://hashbin.org/api/user/aliases'); list.auth = request.auth; list.user = request.auth.user;
  expect((await (await handleUserAliases(list, f.env)).json()).personal).toEqual([]);
  const enable = new Request('https://hashbin.org/api/user/aliases/personal/document', { method: 'PATCH', body: JSON.stringify({ auto_renew: true }) });
  enable.auth = { authenticated: true, user: { userId: 'user', authMethod: 'apikey', scopes: ['aliases:write'] } };
  enable.user = enable.auth.user;
  expect((await handleUserAliases(enable, f.env)).status).toBe(403);
});

it('permits only suspension for upheld trademark reports and preserves the owner', async () => {
  const f = aliasFixture(), cid = await generate256tHash(new Uint8Array([1]));
  await f.global('document', 'claim', { cid });
  const report = await handleCreateDispute(new Request('https://hashbin.org/api/disputes', { method: 'POST', body: JSON.stringify({
    target_type: 'alias', name: 'document', claim_type: 'trademark', evidence: 'Trademark report with evidence of infringement for administrator review.',
    contact: { type: 'email', value: 'test@example.com' }
  }) }), f.env);
  expect(report.status).toBe(201);
  const review = async action => {
    const request = new Request('https://hashbin.org/api/admin/disputes/%40document', { method: 'PATCH',
      body: JSON.stringify({ status: 'closed_deleted', alias_action: action }) });
    request.auth = { authenticated: true, user: { userId: 'admin', session: true, scopes: ['admin:disputes', 'admin:takedown'] } };
    request.user = request.auth.user;
    return handleAdminUpdateDispute(request, f.env, '%40document');
  };
  const rejected = await review('reclaim');
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({ error: 'trademark_suspension_only' });
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(200);
  expect((await review('suspend')).ok).toBe(true);
  expect((await f.global('document', 'resolve', {}, null)).status).toBe(451);
  expect((await f.env.ALIAS_RECORDS.get('alias:document').state.storage.get('alias')).owner_id).toBe('seller');
  expect((await f.global('document', 'assign', { owner_id: 'claimant', cid, admin: true })).status).toBe(400);
});
