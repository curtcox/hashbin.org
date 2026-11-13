import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSandbox, DOM_SANDBOX_BOOTSTRAP, DOM_SANDBOX_BOOTSTRAP_HASH, SANDBOX_BOOTSTRAP } from './hashbin.js';

describe('opaque DOM SDK sandbox', () => {
  let frame, container, ports;
  beforeEach(() => {
    vi.useFakeTimers();
    ports = [{ postMessage: vi.fn(), close: vi.fn() }, { close: vi.fn() }];
    vi.stubGlobal('MessageChannel', class { constructor() { this.port1 = ports[0]; this.port2 = ports[1]; } });
    const listeners = {};
    frame = { setAttribute: vi.fn(), style: {}, contentWindow: { postMessage: vi.fn() }, remove: vi.fn(), addEventListener: (name, handler) => { listeners[name] = handler; }, fire: name => listeners[name]() };
    container = { ownerDocument: { createElement: () => frame }, append: vi.fn() };
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const options = () => ({ source: 'document.body.textContent = "hello"', base: 'https://app.example/', container, execution: 'frame' });

  it('pins the DOM bootstrap hash and authenticates boot before executing source', () => {
    expect(DOM_SANDBOX_BOOTSTRAP_HASH).toBe(`sha256-${createHash('sha256').update(DOM_SANDBOX_BOOTSTRAP).digest('base64')}`);
    expect(DOM_SANDBOX_BOOTSTRAP).not.toContain('</script');
    expect(DOM_SANDBOX_BOOTSTRAP).toContain('e.source!==parent');
    expect(DOM_SANDBOX_BOOTSTRAP).toContain('onmessage=null');
    expect(DOM_SANDBOX_BOOTSTRAP).toContain('x.isTrusted');
  });

  it('provides a visible opaque frame and queues messages until source initialization', async () => {
    const sandbox = createSandbox(options());
    expect(frame.srcdoc).toContain(DOM_SANDBOX_BOOTSTRAP);
    expect(frame.setAttribute).toHaveBeenCalledWith('sandbox', 'allow-scripts');
    expect(frame.setAttribute).not.toHaveBeenCalledWith('aria-hidden', 'true');
    expect(frame.style.display).not.toBe('none');
    sandbox.postMessage('queued');
    expect(ports[0].postMessage).not.toHaveBeenCalled();
    await frame.fire('load');
    const [message, target, transfer] = frame.contentWindow.postMessage.mock.calls[0];
    expect(message.type).toBe('hashbin:sandbox:boot');
    expect(message.source).toContain('"origin":"null"');
    expect(target).toBe('*');
    expect(transfer).toEqual([ports[1]]);
    await ports[0].onmessage({ data: { type: 'hashbin:sandbox:started' } });
    expect(ports[0].postMessage).toHaveBeenCalledWith('queued', []);
    await vi.advanceTimersByTimeAsync(16000);
    expect(frame.remove).not.toHaveBeenCalled();
    sandbox.terminate();
  });

  it('fetches approved module bytes without credentials and blocks other URLs', async () => {
    const fetch = vi.fn(async () => new Response('export const value = 42', { headers: { 'Content-Type': 'text/javascript' } }));
    const sandbox = createSandbox({ ...options(), proxy: ['https://app.example/runtime/'], fetch });
    await ports[0].onmessage({ data: { type: 'hashbin:sandbox:fetch', id: 1, url: 'https://app.example/runtime/module.js' } });
    expect(fetch).toHaveBeenCalledWith('https://app.example/runtime/module.js', { credentials: 'omit' });
    await vi.waitFor(() => expect(ports[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'hashbin:sandbox:response', id: 1 }), expect.any(Array)));
    await ports[0].onmessage({ data: { type: 'hashbin:sandbox:fetch', id: 2, url: 'https://evil.example/runtime/module.js' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(ports[0].postMessage).toHaveBeenLastCalledWith({ type: 'hashbin:sandbox:response', id: 2, error: 'Sandbox request blocked.' }));
    sandbox.terminate();
  });

  it('removes a failed or timed-out frame without a fallback', async () => {
    const sandbox = createSandbox({ ...options(), timeout: 10 });
    sandbox.onerror = vi.fn();
    await vi.advanceTimersByTimeAsync(11);
    expect(sandbox.onerror).toHaveBeenCalledWith(expect.objectContaining({ message: 'Sandbox frame timed out.' }));
    expect(frame.remove).toHaveBeenCalledTimes(1);
    expect(ports[0].close).toHaveBeenCalled();
    expect(ports[1].close).toHaveBeenCalled();
    sandbox.postMessage('too late');
    expect(ports[0].postMessage).not.toHaveBeenCalled();
  });

  it('keeps worker execution as the default and refuses invalid frame combinations', () => {
    const sandbox = createSandbox({ ...options(), execution: 'worker' });
    expect(frame.srcdoc).toContain(SANDBOX_BOOTSTRAP);
    expect(frame.style.display).toBe('none');
    sandbox.terminate();
    expect(() => createSandbox({ ...options(), execution: 'invalid' })).toThrow('execution');
    expect(() => createSandbox({ ...options(), origin: 'hosted' })).toThrow('Frame execution requires opaque');
    expect(() => createSandbox({ ...options(), workerType: 'module' })).toThrow('Module workers require');
  });
});
