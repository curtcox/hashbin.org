// These hosts give projects paths rather than separate browser storage boundaries.
export function webOrigin(uri) {
  try {
    const url = new URL(uri);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}

export function originWarnings(redirectUris, apps, exceptAppId = null) {
  return [...new Set(redirectUris.map(webOrigin).filter(Boolean))].flatMap(origin => {
    const hostname = new URL(origin).hostname;
    const knownSharedHost = ['github.io', 'gitlab.io'].some(host => hostname === host || hostname.endsWith(`.${host}`));
    const others = apps.filter(app => app.status === 'active' && app.app_id !== exceptAppId && app.redirect_uris.some(uri => webOrigin(uri) === origin));
    return knownSharedHost || others.length ? [{
      origin, known_shared_host: knownSharedHost,
      apps: others.map(app => ({ app_id: app.app_id, app_name: app.app_name }))
    }] : [];
  });
}
