import { parseIdentity, confirmedFunding, takeFundedDownload, hardStopped, handshake } from './funding.js';
import { COST_POLICY, identifiedDownloadPriceUc, FUNDED_LEASE_COST_DOLLARS } from '../../../src/utils/cost-policy.js';
const CID_PATTERN = /^([A-Za-z0-9_-]{8,94})(?:\.([a-zA-Z0-9]+))?$/;
const INLINE_CONTENT_THRESHOLD = 64;
const MAX_REQUESTS_PER_WINDOW = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ipWindows = new Map();
const budgetsByEnv = new WeakMap();
const MAX_LOCAL_ENTRIES = 10000;

function trim(map) {
  if (map.size >= MAX_LOCAL_ENTRIES) map.delete(map.keys().next().value);
}

async function takeDownload(env, cid, funded = false) {
  const budgetKey = `${cid}:${funded}`;
  if (!env.CONTENT_METADATA) return 503;
  let budgets = budgetsByEnv.get(env);
  if (!budgets) { budgets = new Map(); budgetsByEnv.set(env, budgets); }
  let lease = budgets.get(budgetKey);
  if (!lease || lease.pending || lease.expires_at <= Date.now()) {
    if (!lease?.pending) {
      trim(budgets);
      lease = { pending: env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(cid))
        .fetch(new Request(`https://internal/download/reserve${funded ? '?funded=true' : ''}`, { method: 'POST' }))
        .then(async response => ({ ...(await response.json()), status: response.status })) };
      budgets.set(budgetKey, lease);
    }
    try {
      const result = await lease.pending;
      if (!Number.isInteger(result.count) || result.count < 0 || result.count > COST_POLICY.leaseSize ||
        (result.count > 0 && (!Number.isFinite(result.expires_at) || result.expires_at <= Date.now() ||
          result.expires_at > Date.now() + COST_POLICY.leaseSeconds * 1000))) {
        throw new Error('Invalid download reservation');
      }
      // Only the first waiter installs the shared object. Every waiter consumes
      // that same object synchronously, preventing duplicate use of reservations.
      if (budgets.get(budgetKey) === lease) {
        budgets.set(budgetKey, { ...result, expires_at: result.expires_at || Date.now() + 60000 });
      }
      lease = budgets.get(budgetKey);
    } catch {
      budgets.set(budgetKey, { count: 0, status: 503, expires_at: Date.now() + 60000 });
      return 503;
    }
  }
  if (!lease.count) {
    // Another waiter can consume the last local request while this one awaits.
    // Ask the file again before charging an identity: there may be more allowance.
    if (lease.status < 400 && lease.expires_at === 0) return takeDownload(env, cid, funded);
    return lease.status >= 400 ? lease.status : 429;
  }
  lease.count -= 1;
  if (!lease.count) lease.expires_at = 0;
  return null;
}

function sampleDownload(env, cid, status, cacheHit, payer = 'anon', price = 0, newLease = false) {
  if (env.DOWNLOAD_ANALYTICS && Math.random() < 0.01) {
    try {
      env.DOWNLOAD_ANALYTICS.writeDataPoint({ indexes: [cid], blobs: [cid, String(status), cacheHit ? 'hit' : 'miss', payer], doubles: [100, payer === 'funded' ? price / 1e8 * 100 : 0, newLease ? FUNDED_LEASE_COST_DOLLARS * 100 : 0] });
    } catch (error) { console.warn('Download sampling failed', error.message); }
  }
}

const MIME_TYPES = {
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  csv: 'text/csv',
  xml: 'text/xml',
  md: 'text/markdown',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  pdf: 'application/pdf',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm'
};

function baseHeaders(extra = {}) {
  return {
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Budget, X-Cache, Retry-After',
    'Cache-Control': 'public, max-age=3600',
    ...extra
  };
}

function textResponse(status, message, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: baseHeaders({
      'content-type': 'text/plain; charset=utf-8',
      ...extraHeaders,
      // A temporary failure must not become an immutable cached content response.
      ...(status >= 400 ? { 'Cache-Control': 'no-store' } : {})
    })
  });
}

function getMimeType(extension, fallback = 'application/octet-stream') {
  if (!extension) {
    return fallback;
  }
  return MIME_TYPES[String(extension).replace(/^\./, '').toLowerCase()] || 'application/octet-stream';
}

function base64UrlDecode(str) {
  const padding = (4 - (str.length % 4)) % 4;
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeLengthPrefix(prefix) {
  const bytes = base64UrlDecode(prefix);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const high = view.getUint16(0, false);
  const low = view.getUint32(2, false);
  return high * 0x100000000 + low;
}

function isInlineContent(cid) {
  return decodeLengthPrefix(cid.slice(0, 8)) <= INLINE_CONTENT_THRESHOLD;
}

function extractInlineContent(cid) {
  const size = decodeLengthPrefix(cid.slice(0, 8));
  const bytes = base64UrlDecode(cid.slice(8));
  if (bytes.length !== size) {
    throw new Error('Inline CID payload size mismatch');
  }
  return bytes;
}

function enforceRateLimit(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const existing = ipWindows.get(ip);

  if (!existing || now >= existing.resetAt) {
    trim(ipWindows);
    ipWindows.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return textResponse(429, 'Rate limited', {
      'Retry-After': String(retryAfter)
    });
  }

  existing.count += 1;
  return null;
}

async function loadMeta(env, cid) {
  const metaObject = await env.CONTENT_BUCKET.get(`${cid}.meta`);
  if (!metaObject) {
    return null;
  }

  try {
    return await metaObject.json();
  } catch {
    return null;
  }
}

async function serveContent(request, env, cid, extension = null, ctx = null, identity = null, payment = {}) {
  if (!CID_PATTERN.test(extension ? `${cid}.${extension}` : cid)) {
    return textResponse(404, 'Not found');
  }

  if (await hardStopped(env)) return textResponse(503, 'Downloads temporarily stopped', { 'Retry-After': '60' });
  const inline = isInlineContent(cid);
  const price = identifiedDownloadPriceUc(decodeLengthPrefix(cid.slice(0, 8)));
  const confirmation = identity ? await confirmedFunding(env, identity, price) : null;
  if (confirmation?.invalid) { enforceRateLimit(request); return textResponse(401, 'Invalid download identity'); }
  if (!confirmation?.funded) {
    if (identity) payment.payer = 'exhausted';
    const limited = enforceRateLimit(request);
    if (limited) return limited;
  }
  const allowance = inline ? null : await takeDownload(env, cid, Boolean(confirmation?.funded));
  if (allowance && allowance !== 429) return textResponse(allowance,
    allowance === 451 ? 'Unavailable for legal reasons' : 'Download allowance unavailable', { 'Retry-After': '60' });
  if (!inline && !allowance) {
    payment.analyticsPayer = 'file';
    payment.payer = payment.payer === 'exhausted' ? 'exhausted' : 'file';
  }
  else if (identity) {
    const funding = confirmation?.funded ? await takeFundedDownload(env, identity, price, ctx) : { funded: false };
    if (funding.invalid) { enforceRateLimit(request); return textResponse(401, 'Invalid download identity'); }
    if (funding.funded) { payment.payer = 'funded'; payment.newLease = funding.new_lease; }
    else {
      payment.payer = 'exhausted';
      // A cached confirmation may outlive the last affordable request.
      if (confirmation?.funded) {
        const limited = enforceRateLimit(request);
        if (limited) return limited;
      }
      if (!inline || env.COST_SAFETY_ALLOWANCE_ONLY === 'true') return textResponse(429, 'Download allowance unavailable', { 'Retry-After': '60' });
    }
  } else if (allowance || env.COST_SAFETY_ALLOWANCE_ONLY === 'true') {
    return textResponse(429, 'Download allowance unavailable', { 'Retry-After': '60' });
  }

  // Normalize irrelevant query strings; GET and HEAD share a GET cache key.
  const cacheUrl = new URL(`https://256t.us/${extension ? `${cid}.${extension}` : cid}`);
  if (new URL(request.url).searchParams.get('download') === 'true') cacheUrl.searchParams.set('download', 'true');
  const cacheKey = new Request(cacheUrl.toString());
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(cacheKey);
  const validUntil = Number(hit?.headers.get('X-Cache-Until') || 0);
  if (hit && validUntil > Date.now()) {
    sampleDownload(env, cid, 200, true, payment.analyticsPayer || (payment.payer === 'exhausted' ? 'anon' : payment.payer), price, payment.newLease);
    const headers = new Headers(hit.headers);
    headers.set('X-Cache', 'HIT');
    headers.set('Cache-Control', `public, max-age=${Math.max(0, Math.floor((validUntil - Date.now()) / 1000))}`);
    return new Response(request.method === 'HEAD' ? null : hit.body, { status: 200, headers });
  }

  const meta = await loadMeta(env, cid);
  // Legacy sidecars need marker reads until rewritten by the owning metadata DO.
  if (meta?.version !== 2) {
    if (await env.CONTENT_BUCKET.head(`${cid}.deleted`)) return textResponse(404, 'Not found');
    if (await env.CONTENT_BUCKET.head(`${cid}.disputed`)) return textResponse(451, 'Unavailable for legal reasons');
  }
  if (meta?.deleted) return textResponse(404, 'Not found');
  if (meta?.disputed) return textResponse(451, 'Unavailable for legal reasons');
  if (meta?.expires_at && new Date(meta.expires_at).getTime() <= Date.now()) return textResponse(404, 'Not found');
  const ttl = Math.min(COST_POLICY.cacheSeconds, meta?.expires_at
    ? Math.floor((new Date(meta.expires_at).getTime() - Date.now()) / 1000) : COST_POLICY.cacheSeconds);
  const finish = async response => {
    response.headers.set('Cache-Control', `public, max-age=${Math.max(0, ttl)}`);
    response.headers.set('X-Cache', 'MISS');
    response.headers.set('X-Cache-Until', String(Date.now() + Math.max(0, ttl) * 1000));
    sampleDownload(env, cid, response.status, false, payment.analyticsPayer || (payment.payer === 'exhausted' ? 'anon' : payment.payer), price, payment.newLease);
    if (cache && request.method === 'GET' && ttl > 0) {
      const write = cache.put(cacheKey, response.clone()).catch(error => console.warn('Cache write failed', error.message));
      if (ctx?.waitUntil) ctx.waitUntil(write); else await write;
    }
    return response;
  };

  const url = new URL(request.url);
  const forceDownload = url.searchParams.get('download') === 'true';
  const method = request.method;

  if (isInlineContent(cid)) {
    let content;
    try {
      content = extractInlineContent(cid);
    } catch {
      return textResponse(404, 'Not found');
    }

    const headers = baseHeaders({
      'content-type': getMimeType(extension, 'application/octet-stream'),
      'content-length': String(content.byteLength)
    });

    if (forceDownload) {
      headers['Content-Disposition'] = `attachment; filename="${extension ? `${cid}.${extension}` : cid}"`;
    }

    if (method === 'HEAD') {
      return finish(new Response(null, { status: 200, headers }));
    }

    return finish(new Response(content, { status: 200, headers }));
  }

  const object = await env.CONTENT_BUCKET.get(cid);
  if (!object) {
    return textResponse(404, 'Not found');
  }

  const headers = baseHeaders({
    'content-type': getMimeType(extension, object.httpMetadata?.contentType || 'application/octet-stream'),
    'content-length': String(object.size)
  });

  if (forceDownload) {
    headers['Content-Disposition'] = `attachment; filename="${extension ? `${cid}.${extension}` : cid}"`;
  }

  if (method === 'HEAD') {
    return finish(new Response(null, { status: 200, headers }));
  }

  return finish(new Response(object.body, {
    status: 200,
    headers
  }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === 'www.256t.us') {
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = '256t.us';
      return Response.redirect(redirectUrl.toString(), 301);
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return textResponse(200, 'OK');
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: baseHeaders({
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, X-API-Key', 'Access-Control-Max-Age': '86400'
    }) });
    if (url.pathname === '/_/session' && request.method === 'GET') {
      try { return await handshake(request, env); }
      catch { return textResponse(503, 'Session temporarily unavailable'); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse(405, 'Method not allowed');
    }

    const signed = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)$/);
    const strict = url.pathname.startsWith('/a/') || url.pathname.startsWith('/s/');
    const filePath = signed ? signed[2] : url.pathname.replace(/^\/a\//, '/').slice(1);
    const match = filePath.match(CID_PATTERN);
    if (!match) {
      return textResponse(404, 'Not found');
    }

    let identity;
    try { identity = await parseIdentity(request, env, match[1], signed?.[1], strict); }
    catch {
      enforceRateLimit(request); // Invalid credentials count but never trigger a DO lookup on funded paths.
      return textResponse(401, 'Invalid or missing download credential');
    }
    try {
      const payment = {};
      const response = await serveContent(request, env, match[1], match[2] || null, ctx, identity, payment);
      response.headers.set('X-Budget', payment.payer || 'anon');
      return response;
    } catch (error) {
      console.error('Content delivery failed', error.message);
      return textResponse(503, 'Content temporarily unavailable', { 'Retry-After': '60' });
    }
  }
};
