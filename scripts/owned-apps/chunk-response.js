/** Serve immutable large runtime files from static chunks without buffering a full VM file. */
export async function chunkResponse(request, assets, files) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/__runtime_chunks/')) return new Response('Not found', { status: 404 });
  const file = Object.hasOwn(files, url.pathname) ? files[url.pathname] : null;
  if (!file) return assets.fetch(request);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const etag = '"' + file.sha256 + '"';
  const headers = {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size),
    'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag,
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
  };
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': headers['Cache-Control'] } });
  if (request.method === 'HEAD') return new Response(null, { headers });
  let index = 0, reader, size = 0, cancelled = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (index === file.chunks.length) { controller.close(); return; }
          const chunk = file.chunks[index];
          if (!reader) {
            const response = await assets.fetch(new URL(chunk.path, url.origin));
            if (!response.ok || !response.body) throw new Error('Runtime chunk unavailable.');
            reader = response.body.getReader(); size = 0;
            if (cancelled) { await reader.cancel(); return; }
          }
          const next = await reader.read();
          if (next.done) {
            reader.releaseLock(); reader = null;
            if (size !== chunk.size) throw new Error('Runtime chunk length mismatch.');
            index++; continue;
          }
          size += next.value.byteLength;
          if (size > chunk.size) throw new Error('Runtime chunk exceeds its pinned length.');
          controller.enqueue(next.value); return;
        }
      } catch (error) { await reader?.cancel().catch(() => {}); controller.error(error); }
    },
    async cancel(reason) { cancelled = true; await reader?.cancel(reason); }
  });
  // Match native static-assets behavior: ignore Range and return the complete verified file.
  return new Response(stream, { headers });
}
