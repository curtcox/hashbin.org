/**
 * UserProfile methods for the devicebasedauth.org account link (the reverse of the DbaLink
 * index) and the pending OIDC state of a link in progress. Installed on
 * UserProfile.prototype (user-profile.js), so `this` is the Durable Object.
 */

import { findSpender } from '../utils/credential-spend.js';

// Storage key of a devicebasedauth.org link in progress (outside the profile; single use)
const DBA_OIDC_STATE = 'dba-oidc-state';

export const dbaMethods = {
  /**
   * The state lives here, never in the browser, and is single use: taking it deletes it.
   * See src/api/dba.js.
   */
  async handleDba(pathname, method, request) {
    if (pathname === '/dba/oidc-state' && method === 'POST') {
      const { state, ttl_seconds: ttl = 600 } = await request.json();
      if (!state || typeof state.state !== 'string' || typeof state.verifier !== 'string' || typeof state.nonce !== 'string') {
        return Response.json({ error: 'invalid_state' }, { status: 400 });
      }
      await this.state.storage.put(DBA_OIDC_STATE, { state: state.state, nonce: state.nonce, verifier: state.verifier,
        expires_at: Date.now() + Math.min(Math.max(Number(ttl) || 0, 1), 3600) * 1000 });
      return Response.json({ stored: true });
    }
    if (pathname === '/dba/oidc-state/take' && method === 'POST') {
      const saved = await this.state.storage.get(DBA_OIDC_STATE);
      if (saved) await this.state.storage.delete(DBA_OIDC_STATE);
      if (!saved || saved.expires_at <= Date.now()) return Response.json({ error: 'no_pending_link' }, { status: 404 });
      return Response.json({ state: saved.state, nonce: saved.nonce, verifier: saved.verifier });
    }

    const profile = await this.state.storage.get('profile');
    if (pathname === '/dba/link' && method === 'GET') return Response.json({ link: profile?.dba_link || null });
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    if (pathname === '/dba/link' && method === 'PUT') {
      const data = await request.json();
      if (typeof data.account !== 'string' || !data.account) return Response.json({ error: 'invalid_request' }, { status: 400 });
      if (profile.deleted_at) return Response.json({ error: 'account_closed' }, { status: 403 });
      // Spending records belong to the linked DBA account; a different account starts fresh.
      if (profile.dba_link?.account !== data.account) profile.dba_credentials = [];
      profile.dba_link = { account: data.account, linked_at: data.linked_at || new Date().toISOString() };
      profile.updated_at = new Date().toISOString();
      await this.state.storage.put('profile', profile);
      return Response.json({ link: profile.dba_link });
    }
    if (pathname === '/dba/credentials/record' && method === 'POST') {
      // Remember a verified credential presented now (it may sign download links)
      const { spender } = await request.json();
      if (spender?.kind !== 'dba' || !Array.isArray(spender.scopes)) return Response.json({ error: 'invalid_request' }, { status: 400 });
      if (profile.deleted_at) return Response.json({ error: 'account_closed' }, { status: 403 });
      const record = findSpender(profile, spender);
      if (!record) return Response.json({ error: 'invalid_credential' }, { status: 403 });
      profile.updated_at = new Date().toISOString();
      await this.state.storage.put('profile', profile);
      return Response.json({ credential_id: record.credential_id });
    }
    if (pathname === '/dba/link' && method === 'DELETE') {
      const data = await request.json().catch(() => ({}));
      const link = profile.dba_link;
      if (!link || (data.account && data.account !== link.account)) return Response.json({ unlinked: null });
      delete profile.dba_link;
      profile.dba_credentials = [];
      profile.updated_at = new Date().toISOString();
      await this.state.storage.put('profile', profile);
      return Response.json({ unlinked: link.account });
    }
    return new Response('Not Found', { status: 404 });
  }
};
