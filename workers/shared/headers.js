export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
  };
}

export function baseHeaders(extra = {}) {
  return {
    ...securityHeaders(),
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Frame-Options': 'DENY',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Budget, X-Cache, Retry-After',
    'Cache-Control': 'public, max-age=3600',
    ...extra
  };
}

export function textResponse(status, message, extraHeaders = {}) {
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

