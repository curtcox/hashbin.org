/**
 * Before a charge made later through a stored devicebasedauth.org spender (an auto-renewal),
 * ask whether that credential has been revoked at DBA since it was last presented here: the
 * pushed revocations, then DBA's status list. HashBin otherwise learns of revocations only
 * when a credential is presented. See todo/dba_integration.md.
 */

import { dbaStatusRevoked } from '../auth/dba-auth.js';

/**
 * Mark the profile's record of a stored DBA spender revoked when DBA says so; findSpender then
 * refuses it. Returns false when DBA's status cannot be read (callers retry later rather than
 * charge), true otherwise. Spenders from a live request were checked by the middleware.
 */
export async function checkStoredDbaSpender(env, profile, spender) {
  if (spender?.kind !== 'dba' || Array.isArray(spender.scopes)) return true;
  const record = (profile?.dba_credentials || []).find(entry => entry.credential_id === spender.id);
  if (!record || record.revoked_at || !record.status) return true;
  try {
    if (await dbaStatusRevoked(env, record.status)) record.revoked_at = new Date().toISOString();
    return true;
  } catch {
    return false;
  }
}
