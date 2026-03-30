export function isOAuthAuth(authResult) {
  return authResult?.authenticated && authResult.user?.authMethod === 'oauth';
}

export function hasOAuthScope(authResult, scope) {
  return Boolean(authResult?.user?.oauth?.scopes?.includes(scope));
}

export function insufficientScopeResponse(scope) {
  return new Response(
    JSON.stringify({
      error: 'insufficient_scope',
      message: `OAuth token is missing ${scope} scope`
    }),
    {
      status: 403,
      headers: { 'content-type': 'application/json' }
    }
  );
}

export function oauthNotAllowedResponse() {
  return new Response(
    JSON.stringify({
      error: 'insufficient_scope',
      message: 'OAuth tokens cannot access this endpoint'
    }),
    {
      status: 403,
      headers: { 'content-type': 'application/json' }
    }
  );
}
