// Both content deliveries and stored-file reservations use the same fail-closed
// safety protocol. Only explicit local development can omit the binding.
export async function readCostSafety(env) {
  if (env.COST_SAFETY_HARD_STOP === 'true') return { hard_stop: true, brake: true };
  if (!env.INFRASTRUCTURE_COST) {
    if (env.ENVIRONMENT !== 'local') throw new Error('Cost safety binding is missing');
    return { hard_stop: false, brake: env.COST_SAFETY_ALLOWANCE_ONLY === 'true' };
  }
  const response = await env.INFRASTRUCTURE_COST.get(env.INFRASTRUCTURE_COST.idFromName('global'))
    .fetch(new Request('https://internal/safety', { signal: AbortSignal.timeout(5000) }));
  if (!response.ok) throw new Error('Cost safety unavailable');
  const safety = await response.json();
  if (!safety || typeof safety.hard_stop !== 'boolean' || typeof safety.brake !== 'boolean') {
    throw new Error('Invalid cost safety response');
  }
  return { hard_stop: safety.hard_stop, brake: env.COST_SAFETY_ALLOWANCE_ONLY === 'true' || safety.brake };
}
