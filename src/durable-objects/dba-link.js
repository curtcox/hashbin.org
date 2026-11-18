/**
 * DbaLink Durable Object: which HashBin account a devicebasedauth.org account is linked to.
 *
 * One object per DBA account (idFromName(acct)), so a credential's `acct` claim finds its
 * HashBin user in one lookup and a DBA account can belong to at most one HashBin user. The
 * user's profile keeps the reverse (`dba_link`); authentication requires both to agree, so
 * a half-finished link or unlink never lets a credential in. See todo/dba_integration.md.
 */

import { handleBackupRequest, registerForBackup } from '../utils/backup.js';

const json = (body, status = 200) => Response.json(body, { status });

export class DbaLink {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const { pathname } = new URL(request.url);
    const method = request.method;
    const link = await this.state.storage.get('link');

    if (pathname === '/link' && method === 'GET') {
      return link ? json(link) : json({ error: 'not_linked' }, 404);
    }

    if (pathname === '/link/claim' && method === 'POST') {
      const data = await request.json();
      if (typeof data.account !== 'string' || !data.account || typeof data.user_id !== 'string' || !data.user_id) {
        return json({ error: 'invalid_request' }, 400);
      }
      // Taking over a link is a compare-and-swap: the caller names the owner it found stale.
      if (link && link.user_id !== data.user_id && link.user_id !== data.replace_user_id) {
        return json({ error: 'already_linked', message: 'This devicebasedauth.org account is linked to another HashBin account' }, 409);
      }
      const next = link?.user_id === data.user_id ? link : { account: data.account, user_id: data.user_id, linked_at: new Date().toISOString() };
      await this.state.storage.put('link', next);
      await registerForBackup(this.state, this.env, 'DBA_LINKS', data.account);
      return json(next);
    }

    if (pathname === '/link/release' && method === 'POST') {
      const data = await request.json();
      if (!link || link.user_id !== data.user_id) return json({ released: false });
      await this.state.storage.delete('link');
      return json({ released: true });
    }

    return json({ error: 'Not found' }, 404);
  }
}
