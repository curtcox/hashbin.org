/** Release names and return holds before retiring an account. Safe to repeat. */
export async function closeAccountAliases(env, userId) {
  const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(userId));
  const close = await profile.fetch(new Request('https://internal/aliases/close', { method: 'POST' }));
  if (close.status === 404) return;
  if (!close.ok) throw new Error('Could not close alias purchases');
  const response = await profile.fetch(new Request('https://internal/aliases'));
  if (response.status === 404) return;
  if (!response.ok) throw new Error('Could not list account aliases');
  const aliases = await response.json();
  const names = new Set([...(aliases.global || []), ...(aliases.offers || [])].map(a => a.name));
  for (const name of names) {
    const result = await env.ALIAS_RECORDS.get(env.ALIAS_RECORDS.idFromName(`alias:${name}`))
      .fetch(new Request('https://internal/delete-user', { method: 'POST', body: JSON.stringify({ name,
        admin: true, target_user_id: userId, request_id: `delete-${userId}`.slice(0, 100).replace(/[^A-Za-z0-9_-]/g, '_') }) }));
    if (!result.ok) throw new Error('Could not release account aliases');
  }
}
