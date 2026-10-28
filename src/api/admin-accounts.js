/**
 * POST /api/admin/accounts/move — move an account's data to a new user ID
 * Body: { from, to, dry_run? }. Needs admin:accounts. See src/services/account-move.js.
 */

import { adminActorId } from '../auth/admin.js';
import { moveAccount } from '../services/account-move.js';
import { logAuditEntry } from './admin.js';

export async function handleMoveAccount(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let report;
  try {
    report = await moveAccount(env, { from: body.from, to: body.to, dryRun: body.dry_run === true });
  } catch (error) {
    return Response.json({ error: 'move_refused', message: error.message }, { status: 409 });
  }

  if (!report.dry_run) {
    await logAuditEntry(env, { actor_type: 'admin', actor_id: adminActorId(request), action: 'move_account',
      resource_type: 'user', resource_id: body.from, metadata: report });
  }
  return Response.json(report);
}
