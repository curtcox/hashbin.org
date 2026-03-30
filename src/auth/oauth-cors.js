const ALLOWED_CORS_HEADERS = 'authorization, content-type';
const ALLOWED_CORS_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALWAYS_ALLOWED_ORIGINS = new Set(['https://curtcox.github.io']);

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

function getTrustedOriginsFromEnv(env) {
  if (!env || typeof env.TRUSTED_CORS_ORIGINS !== 'string') {
    return [];
  }

  return env.TRUSTED_CORS_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isTrustedOrigin(origin, env) {
  if (!origin) {
    return false;
  }

  if (ALWAYS_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  return getTrustedOriginsFromEnv(env).includes(origin);
}

async function isRegisteredOrigin(origin, env) {
  if (!origin) {
    return false;
  }

  if (isTrustedOrigin(origin, env)) {
    return true;
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

  const allowed = await isRegisteredOrigin(origin, env);
  if (!allowed) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_CORS_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS);
  headers.set('Vary', appendVary(headers.get('Vary'), 'Origin'));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
