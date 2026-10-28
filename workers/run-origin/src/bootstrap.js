// Versioned with the hosted frame. Only a registered parent may connect a port;
// top-level navigation (parent === self) never creates a worker.
function hostedBootstrap() {
  const embedders = JSON.parse(document.querySelector('meta[name="hashbin-embedders"]').content);
  addEventListener('message', function connect(event) {
    const data = event.data;
    if (parent === self || event.source !== parent || !embedders.includes(event.origin) || data?.type !== 'hashbin:sandbox:connect' || !event.ports[0]) return;
    removeEventListener('message', connect);
    const port = event.ports[0];
    let worker;
    port.onmessage = event => {
      const data = event.data;
      if (worker) { worker.postMessage(data); return; }
      if (data?.type !== 'hashbin:sandbox:boot' || typeof data.source !== 'string' || !['classic', 'module'].includes(data.workerType)) return;
      let url;
      try {
        url = URL.createObjectURL(new Blob([data.source], { type: 'text/javascript' }));
        worker = new Worker(url, { type: data.workerType });
        // WebKit can fetch the blob asynchronously after construction. Keep it
        // alive until the worker has actually run (or failed), then release it.
        const release = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
        worker.onmessage = event => { release(); port.postMessage(event.data); };
        worker.onerror = event => {
          release();
          event.preventDefault();
          port.postMessage({ type: 'hashbin:sandbox:error', message: String(event.message || 'Sandbox worker failed to start.') });
        };
        port.postMessage({ type: 'hashbin:sandbox:started' });
      } catch (error) {
        if (url) URL.revokeObjectURL(url);
        port.postMessage({ type: 'hashbin:sandbox:error', message: String(error.message || error) });
      }
    };
    port.postMessage({ type: 'hashbin:sandbox:ready', origin: location.origin });
  });
}

export const HOSTED_BOOTSTRAP = `(${hostedBootstrap})();`;
export const FRAME_VERSIONS = ['v0.4.0'];
