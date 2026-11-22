/**
 * UserProfile methods for OAuth grants, authorization codes and refresh tokens. Installed
 * on UserProfile.prototype (user-profile.js), so `this` is the Durable Object.
 */
import { migrateGrantSpending } from '../utils/credential-spend.js';
import { caveatsNarrower } from '../auth/scopes.js';


export const oauthMethods = {
  securityEvent(profile, type, grantId) {
    if (type === 'grant_spend_80_percent') {
      const grant = profile.oauth_grants?.find(entry => entry.grant_id === grantId);
      if (grant?.spend_notice_reset === grant?.spend_reset) return;
      if (grant) grant.spend_notice_reset = grant.spend_reset;
    }
    profile.security_events = [...(profile.security_events || []), {
      id: crypto.randomUUID(), type, grant_id: grantId, created_at: new Date().toISOString()
    }].slice(-100);
  },
  async useOAuthGrant(grantId) {
    const profile = await this.state.storage.get('profile');
    const grant = profile?.oauth_grants?.find(entry => entry.grant_id === grantId && !entry.revoked_at);
    if (!grant) return Response.json({ error: 'Grant not found' }, { status: 404 });
    if (!grant.last_used_at) this.securityEvent(profile, 'grant_first_use', grantId);
    grant.last_used_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);
    return Response.json({ success: true });
  },
  async revokeAllOAuthGrants() {
    const profile = await this.state.storage.get('profile');
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    this.normalizeOAuthCollections(profile);
    const grants = profile.oauth_grants.filter(entry => !entry.revoked_at);
    this.revokeGrants(profile, grants);
    await this.state.storage.put('profile', profile);
    return Response.json({ revoked: grants.length });
  },
  normalizeOAuthCollections(profile) {
    if (!profile.oauth_grants) {
      profile.oauth_grants = [];
    }
    if (!profile.oauth_refresh_tokens) {
      profile.oauth_refresh_tokens = [];
    }
    profile.oauth_grants.forEach(migrateGrantSpending);
  },
  async createOAuthGrant(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grant = {
      grant_id: `grant_${crypto.randomUUID()}`,
      user_id: profile.user_id,
      app_id: data.app_id,
      scopes: data.scopes || [],
      caveats: data.caveats || {},
      spend_used_cents: 0,
      spend_reset: this.nextMonthlyReset(),
      created_at: new Date().toISOString(),
      revoked_at: null
    };
    profile.oauth_grants.push(grant);

    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(grant), {
      headers: { 'content-type': 'application/json' }
    });
  },
  /**
   * Narrow a grant's scopes or caveats; neither may be loosened.
   * Body { scopes?, caveats? }, already parsed by the API handler.
   */
  async narrowOAuthGrant(grantId, data) {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    this.normalizeOAuthCollections(profile);
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === grantId && !entry.revoked_at);
    if (!grant) {
      return Response.json({ error: 'Grant not found' }, { status: 404 });
    }
    if (data.scopes !== undefined && (data.scopes.length === 0 || data.scopes.some((scope) => !grant.scopes.includes(scope)))) {
      return Response.json({ error: 'SCOPE_WIDENING', message: 'An app\'s access can only be narrowed' }, { status: 400 });
    }
    if (data.caveats !== undefined && !caveatsNarrower(grant.caveats || {}, data.caveats)) {
      return Response.json({ error: 'CAVEAT_WIDENING', message: 'An app\'s limits can only be tightened' }, { status: 400 });
    }

    if (data.scopes !== undefined) grant.scopes = data.scopes;
    if (data.caveats !== undefined) grant.caveats = data.caveats;
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);
    return Response.json(grant);
  },
  /**
   * Record a used authorization code; a second use fails. Entries are kept until the code expires.
   */
  async redeemOAuthCode(data) {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const now = Math.floor(Date.now() / 1000);
    const used = (profile.oauth_used_codes || []).filter((entry) => entry.expires_at > now);
    if (typeof data.jti !== 'string' || used.some((entry) => entry.jti === data.jti)) {
      return Response.json({ error: 'Code already used' }, { status: 409 });
    }
    used.push({ jti: data.jti, expires_at: Number(data.expires_at) || now + 600 });
    profile.oauth_used_codes = used;
    await this.state.storage.put('profile', profile);
    return Response.json({ redeemed: true });
  },
  async listOAuthGrants() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);

    return new Response(JSON.stringify({
      security_events: profile.security_events || [],
      authorizations: profile.oauth_grants.filter((grant) => !grant.revoked_at).map(grant => ({
        ...grant,
        spend_used_cents: new Date(grant.spend_reset) <= new Date() ? 0 : grant.spend_used_cents,
        uploads: (profile.uploads || []).filter(upload => upload.grant_id === grant.grant_id).slice(-20)
      }))
    }), {
      headers: { 'content-type': 'application/json' }
    });
  },
  async getOAuthGrant(grantId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === grantId);
    if (!grant) {
      return new Response(JSON.stringify({ error: 'Grant not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(grant), {
      headers: { 'content-type': 'application/json' }
    });
  },
  /**
   * Revoke grants, with their refresh tokens
   */
  revokeGrants(profile, grants) {
    const revokedAt = new Date().toISOString();
    for (const grant of grants) {
      grant.revoked_at = revokedAt;
      for (const token of profile.oauth_refresh_tokens) {
        if (token.grant_id === grant.grant_id && !token.revoked_at) {
          token.revoked_at = revokedAt;
        }
      }
    }
    profile.updated_at = revokedAt;
    return revokedAt;
  },
  async revokeOAuthGrantByApp(appId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grants = profile.oauth_grants.filter((entry) => entry.app_id === appId && !entry.revoked_at);
    if (grants.length === 0) {
      return new Response(JSON.stringify({ error: 'Grant not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    const revokedAt = this.revokeGrants(profile, grants);
    await this.state.storage.put('profile', profile);

    return Response.json({ success: true, app_id: appId, revoked: grants.length, revoked_at: revokedAt });
  },
  async revokeOAuthGrantById(grantId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === grantId && !entry.revoked_at);
    if (!grant) {
      return new Response(JSON.stringify({ error: 'Grant not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    const revokedAt = this.revokeGrants(profile, [grant]);
    await this.state.storage.put('profile', profile);

    return Response.json({ success: true, grant_id: grantId, app_id: grant.app_id, revoked_at: revokedAt });
  },
  async storeOAuthRefreshToken(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);

    const refreshToken = {
      token_hash: data.token_hash,
      dpop_jkt: data.dpop_jkt || null,
      grant_id: data.grant_id,
      app_id: data.app_id,
      user_id: profile.user_id,
      expires_at: data.expires_at,
      created_at: new Date().toISOString(),
      revoked_at: null
    };
    profile.oauth_refresh_tokens.push(refreshToken);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(refreshToken), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  },
  async rotateOAuthRefreshToken(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const token = profile.oauth_refresh_tokens.find((entry) => entry.token_hash === data.current_token_hash);
    // Check client/key binding before reuse handling: another client cannot revoke this grant.
    if (!token || token.app_id !== data.client_id || (token.dpop_jkt && token.dpop_jkt !== data.dpop_jkt)) {
      return Response.json({ error: 'Refresh token not found' }, { status: 404 });
    }
    if (token.rotated_at) {
      const grant = profile.oauth_grants.find(entry => entry.grant_id === token.grant_id);
      if (grant && !grant.revoked_at) {
        this.revokeGrants(profile, [grant]);
        this.securityEvent(profile, 'refresh_token_reuse', grant.grant_id);
        await this.state.storage.put('profile', profile);
      }
      return Response.json({ error: 'Refresh token reused' }, { status: 404 });
    }
    if (token.revoked_at || new Date(token.expires_at) <= new Date() || Date.now() - new Date(token.family_created_at || token.created_at).getTime() >= 90 * 86400000) {
      return new Response(JSON.stringify({ error: 'Refresh token not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    // A revoked or expired grant cannot mint more tokens, and a client may only narrow its scopes
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === token.grant_id && !entry.revoked_at);
    if (!grant || (grant.caveats?.expires_at && new Date(grant.caveats.expires_at) <= new Date())) {
      return Response.json({ error: 'Grant not active' }, { status: 404 });
    }
    if (Array.isArray(data.requested_scopes) && data.requested_scopes.some((scope) => !grant.scopes.includes(scope))) {
      return Response.json({ error: 'invalid_scope' }, { status: 422 });
    }

    token.revoked_at = new Date().toISOString();
    token.rotated_at = token.revoked_at;
    const replacement = {
      family_created_at: token.family_created_at || token.created_at,
      dpop_jkt: token.dpop_jkt || null,
      token_hash: data.new_token_hash,
      grant_id: token.grant_id,
      app_id: token.app_id,
      user_id: profile.user_id,
      expires_at: data.new_expires_at,
      created_at: new Date().toISOString(),
      revoked_at: null
    };
    profile.oauth_refresh_tokens.push(replacement);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify({
      grant_id: token.grant_id,
      app_id: token.app_id,
      user_id: profile.user_id,
      scopes: grant.scopes,
      dpop_jkt: token.dpop_jkt || null
    }), {
      headers: { 'content-type': 'application/json' }
    });
  },
  async revokeOAuthRefreshToken(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    // A stale client may disconnect after another tab rotated this token.
    // Possession still identifies the family that must be revoked.
    const token = profile.oauth_refresh_tokens.find((entry) => entry.token_hash === data.token_hash);
    if (!token) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    const grant = profile.oauth_grants.find(entry => entry.grant_id === token.grant_id && !entry.revoked_at);
    if (grant) this.revokeGrants(profile, [grant]);
    token.revoked_at = new Date().toISOString();
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' }
    });
  },
};
