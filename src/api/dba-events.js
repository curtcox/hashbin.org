/**
 * POST /api/dba/events: devicebasedauth.org's revocation webhook (spec/events.md there).
 * Registered on the hashbin.org audience as https://hashbin.org/api/dba/events.
 *
 * The body is an issuer-signed JWS checked against the same JWKS as credentials, so the route
 * is public: anyone may post, but only DBA can sign. A credentials.revoked event is applied to
 * this isolate's verifier at once and recorded in DbaRevocations for every other isolate,
 * renewal and download (src/auth/dba-auth.js). Answering anything but 2xx makes DBA retry.
 */

import { dbaVerifier } from '../auth/dba.js';
import { forgetPushedDbaRevocations } from '../auth/dba-auth.js';

const MAX_EVENT_BYTES = 64 * 1024;
const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Verify and apply one webhook event. Answers 204 when applied.
 */
export async function handleDbaEvent(request, env) {
  const verifier = dbaVerifier(env);
  if (!verifier) return json({ error: 'AUTH_DBA_UNAVAILABLE', message: 'DBA_ISSUER is not a valid issuer' }, 503);
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_EVENT_BYTES) return json({ error: 'too_large' }, 413);
  const body = await request.text();
  if (body.length > MAX_EVENT_BYTES) return json({ error: 'too_large' }, 413);

  const result = await verifier.handleEvent(body);
  if (!result.ok) return json({ error: 'invalid_event', dba_code: result.code, message: result.message }, result.status);

  if (result.type === 'credentials.revoked' && !result.duplicate) {
    if (!env.DBA_REVOCATIONS) return json({ error: 'not_configured', message: 'DBA_REVOCATIONS is not bound' }, 503);
    const stub = env.DBA_REVOCATIONS.get(env.DBA_REVOCATIONS.idFromName('global'));
    const recorded = await stub.fetch(new Request('https://dba-revocations/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentials: result.payload.credentials.map(({ cid, exp, status }) => ({ cid, exp, status })) })
    })).catch(() => null);
    if (!recorded?.ok) return json({ error: 'unavailable', message: 'Could not record the revocation; retry' }, 503);
    forgetPushedDbaRevocations();
  }
  return new Response(null, { status: 204 });
}
