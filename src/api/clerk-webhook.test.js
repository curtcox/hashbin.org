import { describe, expect, it, vi } from 'vitest';
import { handleClerkWebhook, verifySvixSignature } from './clerk-webhook.js';

const SECRET = `whsec_${btoa('test-secret-key-bytes-1234567890')}`;

async function sign(body, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(secret.slice(6)), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))));
  return new Headers({ 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${sig}` });
}

function envWithProfile(status) {
  const calls = [];
  return {
    calls,
    env: {
      CLERK_WEBHOOK_SECRET: SECRET,
      USER_PROFILES: {
        idFromName: n => n,
        get: name => ({ fetch: vi.fn(async req => { calls.push({ name, method: req.method }); return new Response('{}', { status }); }) })
      }
    }
  };
}

describe('verifySvixSignature', () => {
  it('accepts a valid signature and rejects tampering, wrong secrets, and stale timestamps', async () => {
    const body = '{"type":"user.deleted"}';
    expect(await verifySvixSignature(SECRET, await sign(body), body)).toBe(true);
    expect(await verifySvixSignature(SECRET, await sign(body), body + ' ')).toBe(false);
    expect(await verifySvixSignature(`whsec_${btoa('other')}`, await sign(body), body)).toBe(false);
    const stale = await sign(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await verifySvixSignature(SECRET, stale, body)).toBe(false);
  });
});

describe('handleClerkWebhook', () => {
  it('soft-deletes the profile on user.deleted', async () => {
    const body = JSON.stringify({ type: 'user.deleted', data: { id: 'user_1' } });
    const { env, calls } = envWithProfile(200);
    const response = await handleClerkWebhook(new Request('https://x/api/webhooks/clerk', { method: 'POST', headers: await sign(body), body }), env);
    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'user_1', method: 'DELETE' }]);
  });

  it('creates a profile on user.created and treats an existing one as success', async () => {
    const body = JSON.stringify({ type: 'user.created', data: { id: 'user_2', external_accounts: [{ provider: 'oauth_google' }] } });
    const { env, calls } = envWithProfile(409);
    const response = await handleClerkWebhook(new Request('https://x', { method: 'POST', headers: await sign(body), body }), env);
    expect(response.status).toBe(200);
    expect(calls[0].method).toBe('POST');
  });

  it('rejects unsigned requests and ignores unrelated events', async () => {
    const { env } = envWithProfile(200);
    const unsigned = await handleClerkWebhook(new Request('https://x', { method: 'POST', body: '{}' }), env);
    expect(unsigned.status).toBe(401);

    const body = JSON.stringify({ type: 'session.created', data: { id: 'sess_1' } });
    const ignored = await handleClerkWebhook(new Request('https://x', { method: 'POST', headers: await sign(body), body }), env);
    expect(await ignored.json()).toMatchObject({ ignored: true });
  });
});
