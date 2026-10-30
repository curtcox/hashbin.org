import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIST_STATE, filterApps, readListState, safetyLabel, safetyState, sortApps, summarizeApps, writeListState
} from './developer-apps-list.js';

const app = (name, changes = {}) => ({
  app_id: `app_${name}`,
  client_id: `app_${name}`,
  app_name: name,
  redirect_uris: [`https://${name.toLowerCase()}.example/callback`],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
  run: { status: 'off' },
  safety: null,
  ...changes
});

const apps = [
  app('Beta', { created_at: '2026-03-01T00:00:00.000Z', run: { status: 'active' }, safety: { checked_at: 'x', fix: 2, consider: 0, unreadable: 0 } }),
  app('alpha', { created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', safety: { checked_at: 'x', fix: 0, consider: 1, unreadable: 0 } }),
  app('Gamma', { created_at: '2026-04-01T00:00:00.000Z', run: { status: 'suspended' }, safety: { checked_at: 'x', fix: 0, consider: 0, unreadable: 0 } }),
  app('app 10'),
  app('app 9', { safety: { checked_at: 'x', fix: 0, consider: 3, unreadable: 1 } })
];
const names = list => list.map(entry => entry.app_name);

describe('developer app safety summary', () => {
  it('picks the worst state and labels it', () => {
    expect(safetyState(null)).toBe('unchecked');
    expect(safetyLabel(null)).toBe('Not checked');
    expect(safetyLabel({ fix: 2, consider: 5, unreadable: 1 })).toBe('2 to fix');
    expect(safetyLabel({ fix: 0, consider: 5, unreadable: 1 })).toBe('1 page unreadable');
    expect(safetyLabel({ fix: 0, consider: 5, unreadable: 0 })).toBe('5 to consider');
    expect(safetyLabel({ fix: 0, consider: 0, unreadable: 0 })).toBe('All clear');
  });
});

describe('filterApps', () => {
  it('searches name, client ID and redirect URIs, case-insensitively', () => {
    expect(names(filterApps(apps, { q: 'ALPHA' }))).toEqual(['alpha']);
    expect(names(filterApps(apps, { q: 'app_gam' }))).toEqual(['Gamma']);
    expect(names(filterApps(apps, { q: 'beta.example' }))).toEqual(['Beta']);
    expect(filterApps(apps, { q: '  ' })).toHaveLength(apps.length);
  });

  it('filters by sandbox status and safety state together', () => {
    expect(names(filterApps(apps, { sandbox: 'off' }))).toEqual(['alpha', 'app 10', 'app 9']);
    expect(names(filterApps(apps, { safety: 'unchecked' }))).toEqual(['app 10']);
    expect(names(filterApps(apps, { sandbox: 'off', safety: 'consider' }))).toEqual(['alpha']);
    expect(names(filterApps(apps, { safety: 'unreadable' }))).toEqual(['app 9']);
  });
});

describe('sortApps', () => {
  it('sorts names naturally and ignores case', () => {
    expect(names(sortApps(apps, 'name', 'asc'))).toEqual(['alpha', 'app 9', 'app 10', 'Beta', 'Gamma']);
    expect(names(sortApps(apps, 'name', 'desc'))).toEqual(['Gamma', 'Beta', 'app 10', 'app 9', 'alpha']);
  });

  it('uses the creation time when an app was never updated', () => {
    expect(names(sortApps(apps, 'updated', 'desc'))).toEqual(['alpha', 'Gamma', 'Beta', 'app 9', 'app 10']);
    expect(names(sortApps(apps, 'created', 'asc'))).toEqual(['app 9', 'app 10', 'alpha', 'Beta', 'Gamma']);
  });

  it('puts the apps needing attention first when sorting by safety', () => {
    expect(names(sortApps(apps, 'safety', 'asc'))).toEqual(['Beta', 'app 9', 'alpha', 'app 10', 'Gamma']);
  });

  it('does not change the input', () => {
    const before = names(apps);
    sortApps(apps, 'name', 'desc');
    expect(names(apps)).toEqual(before);
  });
});

describe('summarizeApps', () => {
  it('counts apps, active sandboxes, apps to fix and unchecked apps', () => {
    expect(summarizeApps(apps)).toEqual({ total: 5, sandboxActive: 1, needFixes: 1, unchecked: 1 });
    expect(summarizeApps([])).toEqual({ total: 0, sandboxActive: 0, needFixes: 0, unchecked: 0 });
  });
});

describe('list state in the URL', () => {
  it('round-trips and omits defaults', () => {
    const state = { q: 'my app', sandbox: 'active', safety: 'fix', sort: 'name', dir: 'asc' };
    expect(readListState(writeListState(state))).toEqual(state);
    expect(writeListState(DEFAULT_LIST_STATE)).toBe('');
  });

  it('ignores values the page does not offer', () => {
    expect(readListState('?sandbox=bogus&safety=<b>&sort=evil&dir=up')).toEqual({ ...DEFAULT_LIST_STATE });
  });
});
