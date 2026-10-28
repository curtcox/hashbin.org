/**
 * Move an account's data to a new user ID.
 *
 * Moving from a development to a production Clerk instance gives every user a new ID,
 * and HashBin keys account data by that ID. This copies the profile and payment
 * records to the new ID, re-points ownership of uploads, suppliers and developer apps,
 * and retires the old profile so its balance cannot be spent twice.
 *
 * Keys, app grants, refresh tokens, admin keys and download sessions name the old ID
 * in their signed form, so they are revoked rather than moved; the owner reissues them.
 * Historical records (rate-limit purchases, deletions, admin actions) keep the old ID.
 *
 * Re-running with the same IDs finishes an interrupted move without copying again.
 * See todo/clerk_remaining.md (CL12-CL13).
 */

import { BACKUP_PATH, RESTORE_PATH } from '../utils/backup.js';

const OUTBOX_PREFIX = 'download-outbox:';

function stub(env, binding, name) {
  return env[binding].get(env[binding].idFromName(name));
}

async function readEntries(env, binding, name) {
  const response = await stub(env, binding, name).fetch(new Request(`https://move${BACKUP_PATH}`));
  if (!response.ok) throw new Error(`Could not read ${binding}/${name}: HTTP ${response.status}`);
  return (await response.json()).entries;
}

async function writeEntries(env, binding, name, entries) {
  const response = await stub(env, binding, name).fetch(new Request(`https://move${RESTORE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries, overwrite: true })
  }));
  if (!response.ok) throw new Error(`Could not write ${binding}/${name}: HTTP ${response.status}`);
}

// A profile the new user has only signed in to: no payment history, nothing spent,
// uploaded or issued. (Local accounts start with a credit that has no payment record.)
function isFresh(profile, payments) {
  if (!profile) return true;
  return Object.keys(payments).length === 0 && (profile.total_spent_cents || 0) === 0 &&
    !(profile.uploads || []).length && !(profile.api_keys || []).length && !(profile.oauth_grants || []).length &&
    !(profile.supplier_ids || []).length;
}

/**
 * The old profile as it will live under the new ID: same balance and history, with
 * every credential that names the old ID revoked.
 */
function movedProfile(old, from, to, newProfile, now) {
  const revoke = item => ({ ...item, revoked_at: item.revoked_at || now });
  const profile = {
    ...old,
    user_id: to,
    providers: newProfile?.providers?.length ? newProfile.providers : old.providers,
    api_keys: (old.api_keys || []).map(revoke),
    oauth_grants: (old.oauth_grants || []).map(revoke),
    oauth_refresh_tokens: (old.oauth_refresh_tokens || []).map(revoke),
    admin_keys: (old.admin_keys || []).map(revoke),
    oauth_used_codes: [],
    migrated_from: from,
    migrated_at: now,
    updated_at: now
  };
  const sessions = profile.download_budget?.sessions;
  if (sessions) {
    profile.download_budget = { ...profile.download_budget,
      sessions: Object.fromEntries(Object.entries(sessions).map(([sid, session]) => [sid, revoke(session)])) };
  }
  return profile;
}

// Rewrite one stored record's owner field; returns true when it changed
async function reassign(env, binding, name, key, field, from, to, dryRun) {
  const entries = await readEntries(env, binding, name);
  const record = entries[key];
  if (!record) return false;
  if (Array.isArray(record)) {
    const owned = record.filter(item => item?.[field] === from);
    if (!owned.length) return 0;
    if (!dryRun) {
      entries[key] = record.map(item => item?.[field] === from ? { ...item, [field]: to } : item);
      await writeEntries(env, binding, name, entries);
    }
    return owned.length;
  }
  if (record[field] !== from) return false;
  if (!dryRun) {
    entries[key] = { ...record, [field]: to };
    await writeEntries(env, binding, name, entries);
  }
  return true;
}

/**
 * Move account `from` to user ID `to`. With dryRun, nothing is written and the
 * report says what would change. Throws with a message when the move is refused.
 */
export async function moveAccount(env, { from, to, dryRun = false }) {
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to || from === to) {
    throw new Error('from and to must be two different user IDs');
  }
  const now = new Date().toISOString();
  const report = { from, to, dry_run: dryRun, profile: 'unchanged', payment_records: 'unchanged',
    uploads: 0, suppliers: 0, apps: 0, revoked: {} };

  const oldEntries = await readEntries(env, 'USER_PROFILES', from);
  const old = oldEntries.profile;
  if (!old) throw new Error(`No profile for ${from}`);
  const resuming = old.migrated_to === to;
  if (old.migrated_to && !resuming) throw new Error(`${from} was already moved to ${old.migrated_to}`);
  if (old.deleted_at && !resuming) throw new Error(`${from} is deleted`);

  const newEntries = await readEntries(env, 'USER_PROFILES', to);
  const current = newEntries.profile;

  if (!resuming) {
    if (current?.migrated_from !== from && !isFresh(current, await readEntries(env, 'PAYMENT_RECORDS', to))) {
      throw new Error(`${to} already has account data; move only into an account that has just signed in`);
    }
    if (old.download_outbox?.length || old.download_outbox_pending || Object.keys(oldEntries).some(key => key.startsWith(OUTBOX_PREFIX))) {
      throw new Error(`${from} has download accounting still being delivered; try again in a few minutes`);
    }

    const profile = movedProfile(old, from, to, current, now);
    report.revoked = {
      api_keys: (old.api_keys || []).filter(key => !key.revoked_at).length,
      oauth_grants: (old.oauth_grants || []).filter(grant => !grant.revoked_at).length,
      admin_keys: (old.admin_keys || []).filter(key => !key.revoked_at).length
    };
    report.balance_cents = old.balance_cents || 0;
    report.profile = 'copied';

    const payments = await readEntries(env, 'PAYMENT_RECORDS', from);
    report.payment_records = Object.keys(payments).length ? 'copied' : 'none';

    if (!dryRun) {
      await writeEntries(env, 'USER_PROFILES', to, { ...oldEntries, profile });
      if (Object.keys(payments).length) await writeEntries(env, 'PAYMENT_RECORDS', to, payments);
    }
  }

  // Ownership; each step is idempotent, so a resumed move simply repeats it
  for (const upload of old.uploads || []) {
    if (upload.content_hash && await reassign(env, 'CONTENT_METADATA', upload.content_hash, 'content', 'uploader_id', from, to, dryRun)) report.uploads++;
  }
  for (const supplierId of old.supplier_ids || []) {
    if (await reassign(env, 'SUPPLIER_REGISTRY', supplierId, 'supplier', 'owner_user_id', from, to, dryRun)) report.suppliers++;
  }
  report.apps = Number(await reassign(env, 'APPLICATION_REGISTRY', 'global', 'apps', 'owner_user_id', from, to, dryRun)) || 0;

  // Retire the old profile last, so an interrupted move can be resumed
  if (!dryRun && !resuming) {
    await writeEntries(env, 'USER_PROFILES', from, {
      ...oldEntries,
      profile: { ...movedProfile(old, from, to, null, now), user_id: from, balance_cents: 0,
        moved_balance_cents: old.balance_cents || 0, migrated_from: undefined, migrated_to: to, deleted_at: now }
    });
  }
  report.resumed = resuming;
  return report;
}
