/**
 * Helpers for constructing public content URLs on the dedicated content domain.
 */

export function getContentDomain(env, request = null) {
  if (env.CONTENT_DOMAIN) {
    return env.CONTENT_DOMAIN;
  }

  if (env.ENVIRONMENT === 'local' && request) {
    return new URL(request.url).host;
  }

  return '256t.us';
}

export function getContentBaseUrl(env, request = null) {
  const domain = getContentDomain(env, request);
  if (/^https?:\/\//i.test(domain)) {
    return domain.replace(/\/$/, '');
  }
  return `https://${domain}`.replace(/\/$/, '');
}

export function buildContentUrl(env, cid, extension = null, request = null) {
  const suffix = extension ? `.${extension.replace(/^\./, '')}` : '';
  return `${getContentBaseUrl(env, request)}/${cid}${suffix}`;
}
