const CID_PATTERN = /^([A-Za-z0-9_-]{8,94})(?:\.([a-zA-Z0-9]+))?$/;
const INLINE_CONTENT_THRESHOLD = 64;
const MAX_REQUESTS_PER_WINDOW = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ipWindows = new Map();

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
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...extra
  };
}

function textResponse(status, message, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: baseHeaders({
      'content-type': 'text/plain; charset=utf-8',
      ...extraHeaders
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

async function serveContent(request, env, cid, extension = null) {
  if (!CID_PATTERN.test(extension ? `${cid}.${extension}` : cid)) {
    return textResponse(404, 'Not found');
  }

  const rateLimitResponse = enforceRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const deletedMarker = await env.CONTENT_BUCKET.head(`${cid}.deleted`);
  if (deletedMarker) {
    return textResponse(404, 'Not found');
  }

  const disputedMarker = await env.CONTENT_BUCKET.head(`${cid}.disputed`);
  if (disputedMarker) {
    return textResponse(451, 'Unavailable for legal reasons');
  }

  const meta = await loadMeta(env, cid);
  if (meta?.expires_at && new Date(meta.expires_at) <= new Date()) {
    return textResponse(404, 'Not found');
  }

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
      return new Response(null, { status: 200, headers });
    }

    return new Response(content, { status: 200, headers });
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
    return new Response(null, { status: 200, headers });
  }

  return new Response(object.body, {
    status: 200,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'www.256t.us') {
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = '256t.us';
      return Response.redirect(redirectUrl.toString(), 301);
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return textResponse(200, 'OK');
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse(405, 'Method not allowed');
    }

    const match = url.pathname.slice(1).match(CID_PATTERN);
    if (!match) {
      return textResponse(404, 'Not found');
    }

    return serveContent(request, env, match[1], match[2] || null);
  }
};
