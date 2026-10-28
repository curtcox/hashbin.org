import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSandbox, SANDBOX_BOOTSTRAP } from './hashbin.js';

const clientId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
const expected = 'https://a1932999d125c4cf6bf56806d6df1fa3a.run.example';
let frame, container, ports;
const hosted = options => createSandbox({ source: 'postMessage(hashbinSandbox.origin)', base: 'https://app.example/', container, origin: 'hosted', clientId, runDomain: 'run.example', ...options });

describe('hosted SDK sandbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ports = [{ postMessage: vi.fn(), close: vi.fn() }, { close: vi.fn() }];
    vi.stubGlobal('MessageChannel', class { constructor() { this.port1 = ports[0]; this.port2 = ports[1]; } });
    const listeners = {};
    frame = { setAttribute: vi.fn(), style: {}, contentWindow: { postMessage: vi.fn() }, remove: vi.fn(), addEventListener: (name, handler) => { listeners[name] = handler; }, fire: name => listeners[name]() };
    container = { ownerDocument: { defaultView: { location: { origin: 'https://app.example' } }, createElement: () => frame }, append: vi.fn() };
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('sets the frame origin and sandbox, validates ready, then boots and drains queued messages', async () => {
    const sandbox = hosted({ workerType: 'module' });
    expect(frame.src).toBe(`${expected}/frame/v0.4.0`);
    expect(frame.setAttribute).toHaveBeenCalledWith('sandbox', 'allow-scripts allow-same-origin');
    sandbox.postMessage('queued');
    await frame.fire('load');
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith({ type: 'hashbin:sandbox:connect' }, expected, [ports[1]]);
    expect(ports[0].postMessage).not.toHaveBeenCalled();
    await ports[0].onmessage({ data: { type: 'hashbin:sandbox:ready', origin: expected } });
    expect(ports[0].postMessage.mock.calls[0][0]).toMatchObject({ type: 'hashbin:sandbox:boot', workerType: 'module' });
    expect(ports[0].postMessage.mock.calls[0][0].source).toContain(`"origin":"${expected}"`);
    await ports[0].onmessage({ data: { type: 'hashbin:sandbox:started' } });
    expect(ports[0].postMessage).toHaveBeenLastCalledWith('queued', []);
    await vi.advanceTimersByTimeAsync(20000);
    expect(frame.remove).not.toHaveBeenCalled();
    sandbox.terminate();
  });

  it('rejects mismatched readiness without sending code, and never falls back', async () => {
    const sandbox = hosted();
    sandbox.onerror = vi.fn();
    await ports[0].onmessage({ data: { type: 'hashbin:sandbox:ready', origin: 'https://evil.example' } });
    expect(sandbox.onerror).toHaveBeenCalledWith(expect.objectContaining({ code: 'sandbox_unavailable' }));
    expect(ports[0].postMessage).not.toHaveBeenCalled();
    expect(frame.remove).toHaveBeenCalled();
    expect(frame.srcdoc).toBeUndefined();
  });

  it('times out with sandbox_unavailable and cleans up', async () => {
    const sandbox = hosted({ timeout: 50 });
    sandbox.onerror = vi.fn();
    await vi.advanceTimersByTimeAsync(51);
    expect(sandbox.onerror).toHaveBeenCalledWith(expect.objectContaining({ code: 'sandbox_unavailable' }));
    expect(frame.remove).toHaveBeenCalledTimes(1);
    expect(ports[0].close).toHaveBeenCalled();
  });

  it('keeps opaque mode and the bootstrap hash source unchanged', async () => {
    const sandbox = createSandbox({ source: 'postMessage(1)', base: 'https://app.example/', container });
    expect(frame.setAttribute).toHaveBeenCalledWith('sandbox', 'allow-scripts');
    expect(frame.srcdoc).toContain(SANDBOX_BOOTSTRAP);
    expect(frame.src).toBeUndefined();
    await frame.fire('load');
    const message = frame.contentWindow.postMessage.mock.calls[0];
    expect(message[0].type).toBe('hashbin:sandbox:boot');
    expect(message[0].source).toContain('"origin":"null"');
    expect(message[1]).toBe('*');
    sandbox.terminate();
  });

  it('refuses modules in opaque mode, invalid domains and same-origin frames', () => {
    expect(() => createSandbox({ source: 'x', container, workerType: 'module' })).toThrow('Module workers require');
    for (const runDomain of [null, 'https://run.example', 'run.example/path', 'user@run.example']) expect(() => hosted({ runDomain })).toThrow('runDomain');
    expect(() => hosted({ clientId: 'app_not-a-uuid' })).toThrow('UUID clientId');
    container.ownerDocument.defaultView.location.origin = expected;
    expect(() => hosted()).toThrow('cross-origin');
  });
});
