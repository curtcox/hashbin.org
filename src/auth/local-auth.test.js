import { it, expect, vi } from 'vitest';
import { getOrCreateLocalProfile } from './local-auth.js';

it('accepts another first request creating the same local profile concurrently', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 404 }))
    .mockResolvedValueOnce(Response.json({}, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ user_id: 'user', balance_cents: 1000 }));
  const env = { USER_PROFILES: { idFromName: n => n, get: () => ({ fetch }) } };
  expect(await getOrCreateLocalProfile(env, 'user')).toEqual({ profile: { user_id: 'user', balance_cents: 1000 }, created: false });
});
