import { describe, it, expect } from 'vitest';
import { normalizeAliasName, isReservedAlias, validateAliasCid } from './alias-names.js';
import { generate256tHash } from './hash256t.js';
import { COST_POLICY } from './cost-policy.js';
import { PERSONAL_ALIAS_MONTHLY_CENTS, GLOBAL_ALIAS_YEARLY_CENTS, aliasSaleFee } from './pricing.js';

describe('alias names and marginal cost bounds', () => {
  it.each(['a', '0', 'my-document', 'a.b', 'a_b', 'a'.repeat(63)])('accepts %s', name => expect(normalizeAliasName(name)).toBe(name));
  it.each(['', '-a', 'a-', '.a', 'a.', '_a', 'a_', 'a..b', 'a/b', 'a%2fb', 'é', ' a', 'a ', 'a'.repeat(64), null, 3])('refuses %s', name => expect(normalizeAliasName(name)).toBeNull());
  it('normalizes ASCII case and refuses inline and hashed CID names', async () => {
    expect(normalizeAliasName('My.Name')).toBe('my.name');
    expect(isReservedAlias('admin')).toBe(true);
    for (const size of [0, 1, 20, 100]) {
      const cid = await generate256tHash(new Uint8Array(size));
      expect(validateAliasCid(cid)).toBe(true);
      expect(normalizeAliasName(cid)).toBeNull();
      expect(normalizeAliasName(cid.toLowerCase())).toBeNull();
    }
    for (const cid of ['AAAAAAAB', 'AAAAAAABA', 'AAAAAAABAB', 'AAAAAABkshort', 123]) expect(validateAliasCid(cid)).toBe(false);
  });
  it('covers 31 days of maximum personal changes with one alias’s kept monthly revenue', () => {
    const perChange = (COST_POLICY.workerPerMillion + 3 * COST_POLICY.workerCpuPerMillionMs + COST_POLICY.doPerMillion +
      2 * COST_POLICY.doRowsWrittenPerMillion + 4 * COST_POLICY.doRowsReadPerMillion) / 1e6;
    const storage = 2 * 250 / 1e9 * (COST_POLICY.doStoragePerGBMonth + COST_POLICY.r2StoragePerGBMonth);
    expect(31 * COST_POLICY.aliasChangesPerDay * perChange + storage).toBeLessThan(PERSONAL_ALIAS_MONTHLY_CENTS / 100 * COST_POLICY.revenueKept);
    expect(GLOBAL_ALIAS_YEARLY_CENTS).toBe(100);
    expect([100, 101, 1000].map(aliasSaleFee)).toEqual([10, 11, 100]);
  });
});
