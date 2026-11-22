import { credentialFromRequest } from '../vendor/devicebasedauth/verifier.js';

const ALLOWED_CORS_HEADERS = 'authorization, content-type, x-api-key, dpop, dba-confirmation';
const ALLOWED_CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
// Any origin may call the API with a devicebasedauth.org device credential: it needs no
// cookie, and each request carries a DPoP proof from a key the page cannot export. Other
// credentials still get CORS only on registered developer-app origins.
const DBA_CORS_HEADERS = 'authorization, content-type, dpop, dba-confirmation';

function isApiPath(request) {
  const { pathname } = new URL(request.url);
  return pathname.startsWith('/api/') || pathname === '/health';
}

/** A preflight that could be for a DBA device credential: an API path, asking to send DPoP. */
function isDbaPreflight(request) {
  const requested = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(value => value.trim());
  return isApiPath(request) && requested.includes('dpop');
}

/** A request carrying a DBA device credential (Authorization: DBA …) on an API path. */
function isDbaRequest(request) {
  return isApiPath(request) && credentialFromRequest(request)?.kind === 'device';
}

function appendVary(existingValue, token) {
  if (!existingValue) {
    return token;
  }

  const values = existingValue.split(',').map((value) => value.trim().toLowerCase());
  if (values.includes(token.toLowerCase())) {
    return existingValue;
  }
  return `${existingValue}, ${token}`;
}

async function isRegisteredOrigin(origin, env) {
  if (!origin) {
    return false;
  }

  if (!env.APPLICATION_REGISTRY) {
    return false;
  }

  const registryId = env.APPLICATION_REGISTRY.idFromName('global');
  const registryStub = env.APPLICATION_REGISTRY.get(registryId);
  const response = await registryStub.fetch(new Request(`http://internal/origins/check?origin=${encodeURIComponent(origin)}`));
  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return data.allowed === true;
}

export async function handleOAuthCorsPreflight(request, env) {
  const origin = request.headers.get('origin');
  const allowed = await isRegisteredOrigin(origin, env);

  if (!allowed && origin && isDbaPreflight(request)) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': ALLOWED_CORS_METHODS,
        'Access-Control-Allow-Headers': DBA_CORS_HEADERS,
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin, Access-Control-Request-Headers'
      }
    });
  }

  if (!allowed) {
    return new Response(JSON.stringify({
      error: 'cors_forbidden',
      message: 'Origin is not registered for third-party publishing'
    }), {
      status: 403,
      headers: {
        'content-type': 'application/json',
        Vary: 'Origin'
      }
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': ALLOWED_CORS_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    }
  });
}

export async function withOAuthCors(request, env, response) {
  const origin = request.headers.get('origin');
  if (!origin) {
    return response;
  }

  const dba = isDbaRequest(request);
  const allowed = dba || await isRegisteredOrigin(origin, env);
  if (!allowed) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_CORS_METHODS);
  headers.set('Access-Control-Allow-Headers', dba ? DBA_CORS_HEADERS : ALLOWED_CORS_HEADERS);
  headers.set('Vary', appendVary(appendVary(headers.get('Vary'), 'Origin'), 'Authorization'));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
