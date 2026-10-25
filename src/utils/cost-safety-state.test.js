import { describe, expect, it, vi } from 'vitest';
import { readCostSafety } from './cost-safety-state.js';
const binding = fetch => ({ idFromName: name => name, get: () => ({ fetch }) });

describe('shared cost safety protocol', () => {
  it.each(['production', 'development', undefined])('requires the safety binding outside local mode (%s)', async environment => {
    await expect(readCostSafety({ ENVIRONMENT: environment })).rejects.toThrow('binding is missing');
  });
  it('allows an explicit local fallback and honors local brakes', async () => {
    expect(await readCostSafety({ ENVIRONMENT: 'local' })).toEqual({ hard_stop: false, brake: false });
    expect(await readCostSafety({ ENVIRONMENT: 'local', COST_SAFETY_ALLOWANCE_ONLY: 'true' })).toEqual({ hard_stop: false, brake: true });
  });
  it('honors an emergency hard stop without contacting an unavailable service', async () => {
    const fetch = vi.fn(() => { throw new Error('Unavailable'); });
    expect(await readCostSafety({ COST_SAFETY_HARD_STOP: 'true', INFRASTRUCTURE_COST: binding(fetch) })).toEqual({ hard_stop: true, brake: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves a manual brake when the shared service permits downloads', async () => {
    expect(await readCostSafety({ COST_SAFETY_ALLOWANCE_ONLY: 'true',
      INFRASTRUCTURE_COST: binding(async () => Response.json({ hard_stop: false, brake: false })) })).toEqual({ hard_stop: false, brake: true });
  });
  it.each([
    () => new Response('', { status: 503 }),
    () => new Response('{broken'),
    () => Response.json({ hard_stop: false, brake: null })
  ])('rejects unavailable, unparseable and invalid shared state', async response => {
    await expect(readCostSafety({ INFRASTRUCTURE_COST: binding(async () => response()) })).rejects.toThrow();
  });
});
