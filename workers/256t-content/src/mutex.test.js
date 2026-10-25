import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as wait } from 'node:timers/promises';
import { exclusive } from './mutex.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('request-owned download coordination', () => {
  it('serializes waiting requests and preserves arrival order', async () => {
    vi.stubGlobal('scheduler', { wait });
    const entry = {}, order = [];
    let active = 0;
    await Promise.all(Array.from({ length: 25 }, (_, i) => exclusive(entry, async () => {
      expect(++active).toBe(1);
      await wait(1);
      order.push(i); active--;
    })));
    expect(order).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(entry.locked).toBe(false);
  });
  it('releases the next request after an operation fails', async () => {
    vi.stubGlobal('scheduler', { wait });
    const entry = {};
    const first = exclusive(entry, async () => { await wait(1); throw new Error('DO unavailable'); });
    const rejected = expect(first).rejects.toThrow('DO unavailable');
    const second = exclusive(entry, () => 'paid');
    await rejected;
    expect(await second).toBe('paid');
    expect(entry.locked).toBe(false);
  });
  it('removes a timed-out waiter while preserving the current owner', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(100000);
    vi.stubGlobal('scheduler', { wait: async () => vi.setSystemTime(120000) });
    const entry = { locked: true };
    await expect(exclusive(entry, () => 'unpaid')).rejects.toThrow('timed out');
    expect(entry.waiters).toEqual([]);
    expect(entry.locked).toBe(true);
  });
  it('removes a canceled waiter so later requests can still acquire the lock', async () => {
    vi.stubGlobal('scheduler', { wait: async () => { throw new Error('Canceled'); } });
    const entry = { locked: true };
    await expect(exclusive(entry, () => 'unpaid')).rejects.toThrow('Canceled');
    expect(entry.waiters).toEqual([]);
    entry.locked = false;
    expect(await exclusive(entry, () => 'paid')).toBe('paid');
  });
});
