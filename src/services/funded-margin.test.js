import { describe, it, expect } from 'vitest';
import { fundedMarginExceeded } from './cost-monitor.js';
import { modelIdentifiedDownload } from '../../scripts/cost-safety-model.js';
import { FUNDED_LEASE_COST_DOLLARS } from '../utils/cost-policy.js';
describe('funded margin monitoring', () => {
  it('models positive warm margin, cold singleton risk, and large-file unreported charges', () => {
    expect(modelIdentifiedDownload(100, 250).margin).toBeGreaterThan(0);
    expect(modelIdentifiedDownload(100, 1).margin).toBeLessThan(0);
    expect(modelIdentifiedDownload(100).maxUnreportedCharge).toBe(0.001);
    expect(modelIdentifiedDownload(1024 ** 3).maxUnreportedCharge).toBe(5);
  });
  it('alerts on cold lease overhead above 50% and accepts amortized leases', () => {
    expect(fundedMarginExceeded({ downloads: 1000, price_dollars: 0.004, lease_cost_dollars: FUNDED_LEASE_COST_DOLLARS * 1000 })).toBe(true);
    expect(fundedMarginExceeded({ downloads: 1000, price_dollars: 0.004, lease_cost_dollars: FUNDED_LEASE_COST_DOLLARS * 4 })).toBe(false);
    expect(() => fundedMarginExceeded({ downloads: -1 })).toThrow();
  });
});
