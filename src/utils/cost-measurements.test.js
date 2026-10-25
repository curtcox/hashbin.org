import { describe, expect, it } from 'vitest';
import { measureUsage, priceUsage } from '../services/cost-monitor.js';
import { priceCostUsage, validCostUsage } from './cost-measurements.js';

describe('retained billing measurements', () => {
  it('retains billable units and free operations while pricing shared units consistently', () => {
    const account = { workers: [{ sum: { requests: 1e6, cpuTimeUs: 1e9 } }],
      operations: [['PutObject', 1e6], ['GetObject', 2e6], ['DeleteObject', 3e6]].map(([actionType, requests]) => ({ dimensions: { actionType }, sum: { requests } })),
      r2: [{ max: { payloadSize: 1e9, metadataSize: 0 } }], invocations: [{ sum: { requests: 1e6 } }],
      periodic: [{ sum: { duration: 1e6, rowsRead: 1e6, rowsWritten: 1e6 } }], storage: [{ max: { storedBytes: 1e9 } }] };
    const usage = measureUsage(account, 0.5), costs = priceCostUsage(usage);
    expect(usage.worker_cpu_ms).toBe(1e6); expect(usage.r2_gb_months).toBe(0.5);
    expect(usage.r2_free_operations).toBe(3e6); expect(validCostUsage(usage)).toBe(true);
    expect(costs.workers).toBe(32); expect(costs.r2_operations).toBe(522);
    expect(costs.r2_storage).toBe(0.75); expect(costs.durable_objects).toBeCloseTo(1375.1);
    expect(priceUsage(account, 0.5)).toEqual(costs);
    expect(validCostUsage({ ...usage, worker_requests: -1 })).toBe(false);
    expect(validCostUsage({ ...usage, unknown: 1 })).toBe(false);
    expect(() => priceCostUsage({})).toThrow();
  });
});
