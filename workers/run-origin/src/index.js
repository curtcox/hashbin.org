import pins from '../runtimes.json' with { type: 'json' };
import { labelAppId } from '../../../src/utils/run-origin.js';
import { readCostSafety } from '../../../src/utils/cost-safety-state.js';
import { CID_PATTERN, isInlineContent, extractInlineContent } from '../../shared/content.js';
import { securityHeaders } from '../../shared/headers.js';
import { exclusive } from '../../256t-content/src/mutex.js';
import { HOSTED_BOOTSTRAP, FRAME_VERSIONS } from './bootstrap.js';

const states = new WeakMap();
const MAX_ENTRIES = 10000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
export function runHeaders(extra = {}) {
  return {
    ...securityHeaders(),
    'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), payment=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...extra
  };
}
const reply = (status, body, headers = {}) => new Response(body, { status, headers: runHeaders({ 'Content-Type': 'text/plain; charset=utf-8', ...headers }) });
const registry = env => env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));
async function internal(env, path, data) {
  return registry(env).fetch(new Request(`https://internal${path}`, {
    ...(data ? { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } } : {}), signal: AbortSignal.timeout(5000)
  }));
}
function state(env) {
  if (!states.has(env)) states.set(env, { apps: new Map(), ips: new Map(), leases: new Map() });
  return states.get(env);
}
function set(map, key, value) {
  if (!map.has(key) && map.size >= MAX_ENTRIES) map.delete(map.keys().next().value);
  map.set(key, value);
}
async function appConfig(env, appId) {
  const cache = state(env).apps;
  let entry = cache.get(appId);
  if (!entry || entry.until <= Date.now()) {
    const response = await internal(env, `/run/by-app/${appId}`);
    if (!response.ok && response.status !== 404) throw new Error('Registry unavailable');
    const config = response.status === 404 ? { status: 'off' } : await response.json();
    if (!['active', 'off', 'suspended'].includes(config.status) || (config.status === 'active' &&
      (!Array.isArray(config.embedders) || !Number.isSafeInteger(config.daily_request_cap) || config.daily_request_cap < 1))) throw new Error('Invalid run configuration');
    entry = { config, until: Date.now() + 60000 };
    set(cache, appId, entry);
  }
  return entry.config;
}
function ipLimited(request, env) {
  const windows = state(env).ips;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  let entry = windows.get(ip);
  if (!entry || entry.until <= Date.now()) { entry = { until: Date.now() + 60000, count: 0 }; set(windows, ip, entry); }
  return ++entry.count > 120;
}

async function flush(env, appId, lease) {
  if (!lease.pending) return;
  // Retry the exact cumulative count after an ambiguous failure.
  const batch = lease.batch ||= { app_id: appId, day: lease.day, requests: lease.total, lease_id: lease.id };
  const response = await internal(env, '/run/usage', batch);
  if (!response.ok) throw new Error('Usage flush failed');
  lease.reported = batch.requests;
  lease.pending = lease.total - lease.reported;
  lease.batch = null;
  lease.flushed = Date.now();
}
async function takeRequest(env, appId, ctx) {
  const leases = state(env).leases;
  let lease = leases.get(appId);
  if (!lease) { lease = { remaining: 0, pending: 0, total: 0, reported: 0, day: new Date().toISOString().slice(0, 10), flushed: Date.now() }; set(leases, appId, lease); }
  const operation = exclusive(lease, async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (lease.day !== day) {
      await flush(env, appId, lease);
      Object.assign(lease, { day, remaining: 0 });
    }
    if (lease.pending && Date.now() - lease.flushed >= 60000) await flush(env, appId, lease);
    if (!lease.remaining) {
      await flush(env, appId, lease);
      const response = await internal(env, '/run/reserve', { app_id: appId, day });
      if (!response.ok) return response.status;
      const { count, lease_id } = await response.json();
      if (!Number.isInteger(count) || count < 0 || count > 120 || typeof lease_id !== 'string' || !/^[0-9a-f-]{36}$/.test(lease_id)) throw new Error('Invalid run reservation');
      Object.assign(lease, { remaining: count, id: lease_id, total: 0, reported: 0 });
    }
    if (!lease.remaining) return 429;
    lease.remaining--;
    lease.pending++;
    lease.total++;
    // The first request starts a bounded flush, including short sessions that
    // never send another request. waitUntil extends this request's lifetime.
    if (!lease.flushScheduled && ctx?.waitUntil) {
      lease.flushScheduled = true;
      ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 25000)).then(() => exclusive(lease, () => flush(env, appId, lease)))
        .catch(error => console.warn('Run usage:', error.message)).finally(() => { lease.flushScheduled = false; }));
    }
    return null;
  });
  ctx?.waitUntil(operation.catch(() => {}));
  return operation;
}

function frameDocument(embedders) {
  const content = JSON.stringify(embedders).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll("'", '&#39;');
  return `<!doctype html><meta charset="utf-8"><meta name="hashbin-embedders" content="${content}"><script src="/frame/v0.4.0.js"></script>`;
}
function framePolicy(embedders) {
  // Only canonical origins produced by the registry may enter CSP syntax.
  const origins = embedders.filter(value => { try { return new URL(value).origin === value && /^https?:/.test(value); } catch { return false; } });
  return `default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https:; img-src 'self' blob: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${origins.join(' ') || "'none'"}`;
}
async function runtime(request, env, url, ctx, manifest) {
  if (request.headers.get('Sec-Fetch-Site') !== 'same-origin') return reply(403, 'Runtime files require a same-origin request');
  const match = url.pathname.match(/^\/r\/([^/]+)\/([^/]+)\/(.+)$/);
  const pin = match && Object.hasOwn(manifest, match[1]) && Object.hasOwn(manifest[match[1]], match[2]) && Object.hasOwn(manifest[match[1]][match[2]], match[3]) && manifest[match[1]][match[2]][match[3]];
  if (!pin || !CID_PATTERN.test(pin.cid) || !/^[0-9a-f]{64}$/.test(pin.sha256 || '') || typeof pin.type !== 'string') return reply(404, 'Not found');
  const cache = globalThis.caches?.default;
  const key = new Request(`https://runtime-cache.invalid/${pin.cid}`);
  let cached = await cache?.match(key);
  if (!cached) {
    const metadataResponse = await env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(pin.cid)).fetch(new Request('https://internal/content'));
    if (!metadataResponse.ok) return reply(404, 'Runtime unavailable');
    const data = await metadataResponse.json();
    const meta = data.content || data;
    if (meta.deleted || meta.disputed || !Number.isFinite(Date.parse(meta.expires_at)) || Date.parse(meta.expires_at) <= Date.now()) return reply(404, 'Runtime unavailable');
    const object = isInlineContent(pin.cid) ? { body: extractInlineContent(pin.cid) } : await env.CONTENT_BUCKET.get(pin.cid);
    if (!object) return reply(404, 'Runtime unavailable');
    cached = new Response(object.body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
    if (cache) {
      const write = cache.put(key, cached.clone());
      if (ctx?.waitUntil) ctx.waitUntil(write); else await write;
    }
  }
  const headers = runHeaders({ 'Content-Type': pin.type, 'Cache-Control': IMMUTABLE, ETag: `"${pin.cid}"` });
  if (request.headers.get('If-None-Match') === `"${pin.cid}"`) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : cached.body, { headers });
}

// manifest injection is used by unit/browser fixtures; production always imports pins.
export function createRunWorker(manifest = pins) {
  async function handle(request, env, ctx) {
    const url = new URL(request.url);
    let appId;
    let response;
    try {
      // Never copy request headers to internal requests or return cookie headers.
      const domain = env.RUN_DOMAIN;
      if (!domain) return reply(503, 'Run domain is not configured');
      const domainHost = new URL(`https://${domain}`).hostname;
      if (url.hostname === `www.${domainHost}`) return reply(301, '', { Location: `https://${domainHost}/` });
      if (url.hostname === domainHost) return url.pathname === '/' ? reply(200, '<!doctype html><meta charset="utf-8"><title>HashBin run origins</title><h1>This domain runs code for apps that use HashBin</h1><p><a href="https://hashbin.org/docs/sdk#hosted-sandbox">SDK guide</a> · <a href="mailto:curtcox@gmail.com">Report a problem</a></p>', { 'Content-Type': 'text/html; charset=utf-8' }) : reply(404, 'Not found');
      if (!url.hostname.endsWith(`.${domainHost}`)) return reply(404, 'Not found');
      appId = labelAppId(url.hostname.slice(0, -(domainHost.length + 1)));
      if (!appId) return reply(404, 'Not found');
      const config = await appConfig(env, appId);
      if (config.status === 'suspended') return reply(403, 'Hosted sandbox suspended');
      if (config.status !== 'active') return reply(404, 'Not found');
      const safety = await readCostSafety(env);
      if ((env.ENVIRONMENT !== 'local' && typeof safety.run_brake !== 'boolean') || safety.hard_stop || safety.run_brake) return reply(503, 'Hosted sandbox temporarily stopped', { 'Retry-After': '60' });
      if (ipLimited(request, env)) return reply(429, 'Rate limited', { 'Retry-After': '60' });
      const limited = await takeRequest(env, appId, ctx);
      if (limited) return reply(limited, 'Hosted sandbox request allowance unavailable', { 'Retry-After': '60' });
      if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'Method not allowed', { Allow: 'GET, HEAD' });
      if (url.pathname === '/health') response = reply(200, 'OK');
      else if (url.pathname.startsWith('/r/')) response = await runtime(request, env, url, ctx, manifest);
      else {
        const match = url.pathname.match(/^\/frame\/(v\d+\.\d+\.\d+)(\.js)?$/);
        if (!match || !FRAME_VERSIONS.includes(match[1])) response = reply(404, 'Not found');
        else if (match[2]) response = reply(200, HOSTED_BOOTSTRAP, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': IMMUTABLE });
        else response = reply(200, frameDocument(config.embedders), {
          'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', Vary: 'Host',
          'Content-Security-Policy': framePolicy(config.embedders)
        });
      }
    } catch (error) {
      console.warn('Run origin:', error.message);
      response = reply(503, 'Hosted sandbox temporarily unavailable', { 'Retry-After': '60' });
    } finally {
      // Include refusals: they cost Worker requests too. One unsampled point per
      // invocation; Analytics Engine _sample_interval accounts for ingestion sampling.
      try { env.RUN_ANALYTICS?.writeDataPoint({ indexes: [appId || 'unregistered'], blobs: [appId || 'unregistered'], doubles: [1] }); } catch { /* Analytics must not break delivery. */ }
    }
    return response;
  }
  return {
    async fetch(request, env, ctx) {
      const response = await handle(request, env, ctx);
      return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }
  };
}
export default createRunWorker();
