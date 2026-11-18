import { beforeEach, describe, expect, it } from 'vitest';
import { DbaLink } from './dba-link.js';
import { memoryState } from '../../test-utils/alias-fixture.js';

describe('DbaLink Durable Object', () => {
  let link, registrations;
  const post = (path, body) => link.fetch(new Request(`https://dba-link${path}`, { method: 'POST', body: JSON.stringify(body) }));

  beforeEach(() => {
    registrations = [];
    const backupIndex = { fetch: async request => { registrations.push(await request.json()); return Response.json({ ok: true }); } };
    link = new DbaLink(memoryState(), { BACKUP_INDEX: { idFromName: name => name, get: () => backupIndex } });
  });

  it('links an account to one user and keeps the first link time', async () => {
    expect((await link.fetch(new Request('https://dba-link/link'))).status).toBe(404);
    const first = await (await post('/link/claim', { account: 'acct_1', user_id: 'alice' })).json();
    expect(first).toMatchObject({ account: 'acct_1', user_id: 'alice' });
    const again = await (await post('/link/claim', { account: 'acct_1', user_id: 'alice' })).json();
    expect(again.linked_at).toBe(first.linked_at);
    expect(registrations).toContainEqual({ binding: 'DBA_LINKS', name: 'acct_1' });
  });

  it('refuses another user unless they name the current owner as stale', async () => {
    await post('/link/claim', { account: 'acct_1', user_id: 'alice' });
    expect((await post('/link/claim', { account: 'acct_1', user_id: 'bob' })).status).toBe(409);
    expect((await post('/link/claim', { account: 'acct_1', user_id: 'bob', replace_user_id: 'carol' })).status).toBe(409);
    expect(await (await post('/link/claim', { account: 'acct_1', user_id: 'bob', replace_user_id: 'alice' })).json()).toMatchObject({ user_id: 'bob' });
  });

  it('releases only for the linked user', async () => {
    await post('/link/claim', { account: 'acct_1', user_id: 'alice' });
    expect(await (await post('/link/release', { user_id: 'bob' })).json()).toEqual({ released: false });
    expect(await (await post('/link/release', { user_id: 'alice' })).json()).toEqual({ released: true });
    expect((await link.fetch(new Request('https://dba-link/link'))).status).toBe(404);
  });

  it('rejects malformed claims', async () => {
    expect((await post('/link/claim', { account: '', user_id: 'alice' })).status).toBe(400);
  });
});
