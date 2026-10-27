export const UC_PER_CENT = 1e6;
export function validDownloadCaps(caps) {
  return caps === null || (caps && ['daily_cap_cents', 'monthly_cap_cents'].every(
    key => Number.isSafeInteger(caps[key]) && caps[key] >= 0 && caps[key] <= 100000000));
}
export function downloadBudget(profile, now = new Date()) {
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  const b = profile.download_budget ||= { account: null, keys: {}, float_uc: 0, sessions: {}, leases: {}, spend: { day, month, account: { day_uc: 0, month_uc: 0 }, keys: {} } };
  return b;
}
// A credential limited to certain CIDs (its cids caveat) may fund only those.
function cidAllowed(caveats, cid) {
  return cid === undefined || !Array.isArray(caveats?.cids) || caveats.cids.includes(cid);
}
export function downloadIdentityValid(profile, identity, now = Date.now(), cid = undefined) {
  if (!identity || identity.u !== profile.user_id || profile.deleted_at) return false;
  if (identity.kind === 'key') {
    return (profile.api_keys || []).some(k => k.key_id === identity.k && !k.revoked_at &&
      new Date(k.expires_at).getTime() > now && (!identity.key_hash || identity.key_hash === k.key_hash) &&
      k.scopes?.includes('downloads:spend') && cidAllowed(k.caveats, cid));
  }
  if (identity.kind === 'oauth') {
    return (profile.oauth_grants || []).some(g => g.grant_id === identity.k && !g.revoked_at &&
      (!identity.app_id || g.app_id === identity.app_id) && g.scopes?.includes('downloads:spend') &&
      !(g.caveats?.expires_at && Date.parse(g.caveats.expires_at) <= now) && cidAllowed(g.caveats, cid));
  }
  if (identity.kind === 'session') {
    const s = profile.download_budget?.sessions?.[identity.sid];
    return Boolean(s && !s.revoked_at && s.active && s.expires_at > now);
  }
  return false;
}
export function identityKey(identity) { return `${identity.kind}:${identity.k || identity.sid}`; }
