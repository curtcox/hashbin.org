// Local HTTP adapter around the actual run Worker and application registry.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import worker from '../workers/run-origin/src/index.js';
import { ApplicationRegistry } from '../src/durable-objects/application-registry.js';

const appId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
const app = { app_id: appId, app_name: 'Hosted test app', status: 'active', owner_user_id: 'test', redirect_uris: ['http://127.0.0.1:8789/callback'], run: { status: 'active', allow_local: true, daily_request_cap: 20000 } };
const secondApp = { ...app, app_id: 'app_2eabd9ad-8b90-4635-accd-7583e5241f96', owner_user_id: 'other', app_name: 'Second isolated test app' };
const data = new Map([['apps', [app, secondApp]]]);
const registry = new ApplicationRegistry({ storage: { get: async key => structuredClone(data.get(key)), put: async (key, value) => data.set(key, structuredClone(value)) } }, { RUN_DOMAIN: 'localhost:8790' });
const env = { ENVIRONMENT: 'local', RUN_DOMAIN: 'localhost:8790', APPLICATION_REGISTRY: { idFromName: x => x, get: () => registry } };
const servers = [];
for (const port of [8789, 8790]) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      let response;
      if (port === 8790) response = await worker.fetch(new Request(url, { method: incoming.method, headers: incoming.headers }), env);
      else if (url.pathname === '/sdk.js') response = new Response(await readFile(new URL('../frontend/sdk/hashbin.js', import.meta.url)), { headers: { 'Content-Type': 'text/javascript' } });
      else if (url.pathname === '/api/config') response = Response.json({ authMode: 'local', isLocalMode: true });
      else if (url.pathname === '/api/developers/apps') response = await registry.fetch(new Request('http://internal/apps?owner_user_id=test'));
      else if (url.pathname === `/api/developers/apps/${appId}/safety`) response = Response.json({ pages: [], checked_at: null });
      else if (url.pathname === `/api/developers/apps/${appId}/run`) {
        if (incoming.method === 'GET') response = await registry.fetch(new Request(`http://internal/apps/${appId}/run?owner_user_id=test`));
        else {
          const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString());
          response = await registry.fetch(new Request(`http://internal/apps/${appId}/run`, { method: 'PUT', body: JSON.stringify({ ...body, owner_user_id: 'test' }) }));
        }
      } else if (['/developers', '/developers/apps'].includes(url.pathname) || /^\/(js|css|img)\/[a-zA-Z0-9_./-]+$/.test(url.pathname)) {
        const path = url.pathname.startsWith('/developers') ? `${url.pathname}.html` : url.pathname;
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
        response = new Response(await readFile(new URL(`../frontend${path}`, import.meta.url)), { headers: { 'Content-Type': types[extname(path)] || 'application/octet-stream' } });
      }
      else response = new Response('<!doctype html><meta charset="utf-8"><title>Hosted sandbox test</title><body>Hosted sandbox test</body>', { headers: { 'Content-Type': 'text/html' } });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500).end(error.message); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '::', resolve); });
  servers.push(server);
}
console.log('Hosted sandbox fixtures ready on 8789 and 8790');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const server of servers) server.close(); });
