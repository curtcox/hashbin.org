/**
 * Local Authentication Helpers
 * Used for fully local development (no external auth providers).
 */

const LOCAL_USER_ID_MAX_LENGTH = 256;
const LOCAL_STARTING_BALANCE_CENTS = 1000;

export function validateLocalUserId(rawUserId) {
  if (typeof rawUserId !== 'string') {
    return { valid: false, reason: 'missing' };
  }

  const userId = rawUserId.trim();
  if (!userId) {
    return { valid: false, reason: 'missing' };
  }

  if (userId.length > LOCAL_USER_ID_MAX_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }

  return { valid: true, userId };
}

export async function getOrCreateLocalProfile(env, userId) {
  const userProfileId = env.USER_PROFILES.idFromName(userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const profileResponse = await userProfileStub.fetch(
    new Request('http://internal/profile', { method: 'GET' })
  );

  if (profileResponse.ok) {
    const profile = await profileResponse.json();
    return { profile, created: false };
  }

  if (profileResponse.status !== 404) {
    throw new Error('Failed to load user profile');
  }

  const createResponse = await userProfileStub.fetch(
    new Request('http://internal/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        providers: ['local'],
        initial_balance_cents: LOCAL_STARTING_BALANCE_CENTS
      })
    })
  );

  // Page scripts and the navigation can both make the first authenticated
  // request. The other request's successful creation is also success here.
  if (createResponse.status === 409) {
    const existing = await userProfileStub.fetch(new Request('http://internal/profile'));
    if (existing.ok) return { profile: await existing.json(), created: false };
  }

  if (!createResponse.ok) {
    throw new Error('Failed to create local user profile');
  }

  const profile = await createResponse.json();
  return { profile, created: true };
}
