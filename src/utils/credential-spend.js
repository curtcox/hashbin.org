/**
 * Monthly spending by a delegated credential (an API key or an OAuth grant).
 *
 * A credential's caveats may set monthly_spend_limit_cents. Every balance debit and
 * download lease made with the credential counts against it: uploads, extensions,
 * rate-limit purchases and funded downloads alike. Usage resets monthly.
 */

/**
 * Move a grant's spending fields from the original dollar amounts to cents caveats.
 * Returns true when the grant changed.
 */
export function migrateGrantSpending(grant) {
  let changed = false;
  if (grant.spending_limit !== undefined) {
    if (grant.spending_limit !== null && grant.caveats?.monthly_spend_limit_cents === undefined) {
      grant.caveats = { ...(grant.caveats || {}), monthly_spend_limit_cents: Math.round(grant.spending_limit * 100) };
    }
    delete grant.spending_limit;
    changed = true;
  }
  if (grant.spending_used !== undefined) {
    grant.spend_used_cents = (grant.spend_used_cents || 0) + grant.spending_used * 100;
    delete grant.spending_used;
    changed = true;
  }
  if (grant.spending_reset !== undefined) {
    grant.spend_reset = grant.spend_reset || grant.spending_reset;
    delete grant.spending_reset;
    changed = true;
  }
  return changed;
}

/**
 * The live credential record a spender refers to, or null when it is missing,
 * revoked or expired. spender: { kind: 'key' | 'oauth', id }.
 */
export function findSpender(profile, spender, now = new Date()) {
  if (spender?.kind === 'key') {
    const key = (profile.api_keys || []).find(entry => entry.key_id === spender.id);
    return key && !key.revoked_at && new Date(key.expires_at) > now ? key : null;
  }
  if (spender?.kind === 'oauth') {
    const grant = (profile.oauth_grants || []).find(entry => entry.grant_id === spender.id);
    if (!grant || grant.revoked_at) return null;
    migrateGrantSpending(grant);
    return grant.caveats?.expires_at && new Date(grant.caveats.expires_at) <= now ? null : grant;
  }
  return null;
}

/**
 * Start a new month of usage when the last one has ended.
 */
export function rollSpend(credential, now, nextReset) {
  if (!credential.spend_reset || new Date(credential.spend_reset) <= now) {
    credential.spend_used_cents = 0;
    credential.spend_reset = nextReset;
  }
}

/**
 * Cents the credential may still spend this month (Infinity without a limit).
 */
export function spendRoomCents(credential) {
  const limit = credential.caveats?.monthly_spend_limit_cents;
  return limit === undefined || limit === null ? Infinity : Math.max(0, limit - (credential.spend_used_cents || 0));
}

export function recordSpend(credential, cents) {
  credential.spend_used_cents = Math.max(0, (credential.spend_used_cents || 0) + cents);
}
