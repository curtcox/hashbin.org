import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

describe('production bootstrap bundle', () => {
  it('connects after bundling with function-name preservation enabled', async () => {
    const result = await build({ entryPoints: [new URL('./bootstrap.js', import.meta.url).pathname],
      bundle: true, format: 'esm', keepNames: true, write: false, platform: 'browser' });
    // Only our own freshly compiled source enters this module, never user input.
    // eslint-disable-next-line no-unsanitized/method
    const { HOSTED_BOOTSTRAP } = await import(`data:text/javascript,${encodeURIComponent(result.outputFiles[0].text)}`);
    const parent = {}, events = new Map(), messages = [];
    const scope = { parent, self: {}, location: { origin: 'https://app.hashbin.app' },
      document: { querySelector: () => ({ content: '["https://editor.example"]' }) },
      addEventListener: (type, handler) => events.set(type, handler),
      removeEventListener: type => events.delete(type) };
    runInNewContext(HOSTED_BOOTSTRAP, scope);
    const port = { postMessage: data => messages.push(data) };
    events.get('message')({ source: parent, origin: 'https://editor.example',
      data: { type: 'hashbin:sandbox:connect' }, ports: [port] });
    expect(messages[0].type).toBe('hashbin:sandbox:ready');
    expect(messages[0].origin).toBe('https://app.hashbin.app');
    expect(events.has('message')).toBe(false);
  });
});
