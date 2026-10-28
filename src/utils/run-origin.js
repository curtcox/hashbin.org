import { webOrigin } from '../auth/shared-origins.js';

export const DEFAULT_RUN = Object.freeze({ status: 'off', allow_local: false, daily_request_cap: 20000 });
export const APP_ID = /^app_([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/;

export function appLabel(appId) {
  if (!APP_ID.test(appId || '')) throw new Error('A UUID clientId is required for hosted mode.');
  return `a${appId.slice(4).replaceAll('-', '')}`;
}

export function labelAppId(label) {
  if (!/^a[0-9a-f]{32}$/.test(label)) return null;
  const hex = label.slice(1);
  return `app_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function runOrigin(appId, domain) {
  if (!domain) return null;
  // A domain (and optionally a local port), never a URL, path, or credentials.
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::\d{1,5})?$/.test(domain)) throw new Error('Invalid run domain');
  const url = new URL(`https://${appLabel(appId)}.${domain}`);
  if (url.hostname.endsWith('.localhost')) url.protocol = 'http:';
  return url.origin;
}

export function runEmbedders(app) {
  return [...new Set((app.redirect_uris || []).map(webOrigin).filter(origin => {
    if (!origin) return false;
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return local ? app.run?.allow_local === true : url.protocol === 'https:';
  }))];
}
