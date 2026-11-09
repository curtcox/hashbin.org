import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootMigration } from './migration.js';

const apps = { modl: { legacy: 'https://curtcox.github.io/modl/', origin: 'https://modl.hashbin.page' } };
function fixture(hasMenu) {
  const created = [], listeners = new Map();
  const make = tag => {
    const node = { tag, children: [], isConnected: false, textContent: '', style: {},
      append(...children) { this.children.push(...children); for (const child of children) child.isConnected = this.isConnected; },
      setAttribute: vi.fn() };
    created.push(node); return node;
  };
  const body = make('body'); body.dataset = {}; body.isConnected = true;
  const menu = make('div'); menu.isConnected = true;
  const state = { hasMenu };
  vi.stubGlobal('location', new URL(apps.modl.legacy));
  vi.stubGlobal('document', { body, createElement: make,
    querySelector: () => state.hasMenu ? menu : null,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } });
  return { body, menu, created, listeners, state };
}
afterEach(() => vi.unstubAllGlobals());
describe('on-demand legacy-origin recovery', () => {
  it('offers transfers inside More without creating a banner or overlay', () => {
    const f = fixture(true); bootMigration(apps);
    expect(f.body.children).toEqual([]);
    expect(f.created.some(node => node.tag === 'aside')).toBe(false);
    expect(f.menu.children).toHaveLength(1);
    expect(f.menu.children[0].tag).toBe('details');
    expect(f.menu.children[0].children[0].textContent).toBe('Move saved work');
    expect(f.menu.children[0].children.filter(node => node.tag === 'button').map(node => node.textContent)).toEqual(['Move saved work', 'Download backup']);
    expect(f.listeners.size).toBe(0);
  });
  it('waits for a late-mounted editor menu and installs recovery exactly once', () => {
    const f = fixture(false); bootMigration(apps);
    expect(f.body.children).toEqual([]); expect(f.menu.children).toEqual([]);
    f.state.hasMenu = true; f.listeners.get('click')();
    expect(f.menu.children).toHaveLength(1); expect(f.listeners.size).toBe(0);
  });
  it('adds no legacy migration UI on the canonical origin', () => {
    const f = fixture(true); vi.stubGlobal('location', new URL(apps.modl.origin)); bootMigration(apps);
    expect(f.body.children).toEqual([]); expect(f.menu.children).toEqual([]); expect(f.listeners.size).toBe(0);
  });
});
