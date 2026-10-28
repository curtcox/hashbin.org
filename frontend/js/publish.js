import { initializeAuth, getAuthHeaders, signIn } from '/js/auth-loader.js';
import { verifyCID } from '/sdk/hashbin.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const clientId = params.get('client_id');
const redirectUri = params.get('redirect_uri');
const state = params.get('state');
const mode = params.get('mode') || 'popup';
const handoffKey = `hashbin:publish:handoff:${state}`;
let bytes, contentType, quote, app, accepted = false, busy = false;
const redirectOrigin = (() => { try { return new URL(redirectUri).origin; } catch { return null; } })();
const status = text => { $('status').textContent = text; };

async function accept(payload) {
  if (accepted || busy || !app || payload?.state !== state) return;
  if (payload.allowanceUrl) {
    const url = new URL(payload.allowanceUrl);
    if (url.origin !== location.origin || url.pathname !== '/oauth/authorize' || url.searchParams.get('client_id') !== clientId || url.searchParams.get('redirect_uri') !== redirectUri) throw new Error('Invalid allowance request');
    $('document-review').hidden = true;
    $('allowance').hidden = false;
    $('allowance-link').href = url.href;
    accepted = true;
    status('Review the allowance on HashBin to continue.');
    return;
  }
  const input = payload.encoding === 'base64url' ? Uint8Array.from(atob(payload.bytes.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) : payload.bytes;
  const blob = input instanceof Blob ? input : new Blob([input]);
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error('Documents must contain 1 byte to 5 MiB.');
  busy = true;
  bytes = await blob.arrayBuffer();
  contentType = payload.contentType || 'application/octet-stream';
  accepted = true;
  $('details').textContent = `${bytes.byteLength} bytes, ${contentType}`;
  // Never render user HTML, SVG, scripts or embedded resources. Preview only text.
  $('preview').textContent = new TextDecoder().decode(bytes.slice(0, 16384));
  $('review').disabled = false;
  busy = false;
  status('Review the document, retention and price before approving.');
}

function finish(result) {
  try { sessionStorage.removeItem(handoffKey); } catch { /* Storage can be disabled. */ }
  if (mode === 'popup') {
    if (!window.opener) throw new Error('The opener connection was lost. Use redirect mode.');
    window.opener.postMessage({ type: 'hashbin:publish:result', state, ...result }, redirectOrigin);
    window.close();
  } else {
    const url = new URL(redirectUri);
    url.hash = new URLSearchParams({ hashbin_publish: state, ...(result.error ? { error: result.error } : { cid: result.cid }) }).toString();
    location.replace(url.href);
  }
}

$('cancel').addEventListener('click', () => finish({ error: 'access_denied' }));
$('retention').addEventListener('input', () => { quote = null; $('approve').disabled = true; $('quote').textContent = 'Review the new price before approving.'; });
$('review').addEventListener('click', async () => {
  $('review').disabled = true;
  $('retention').disabled = true;
  try {
    await initializeAuth();
    let headers = await getAuthHeaders();
    if (!headers) { await signIn(); headers = await getAuthHeaders(); }
    if (!headers) throw new Error('Sign in to review this save.');
    const url = new URL('/api/publish', location.origin);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, retention_months: $('retention').value });
    const response = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': contentType }, body: bytes });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error);
    if (!await verifyCID(data.cid, bytes)) throw new Error('Content ID mismatch');
    quote = data;
    $('quote').textContent = `CID: ${data.cid}. Retention: ${data.retention_months} months. Exact price: $${(data.cost_cents / 100).toFixed(2)}. Balance: $${(data.balance_cents / 100).toFixed(2)}. Approval expires in five minutes.`;
    $('approve').textContent = `Approve this save ($${(data.cost_cents / 100).toFixed(2)})`;
    $('approve').disabled = data.balance_cents < data.cost_cents;
    status(data.balance_cents < data.cost_cents ? 'Add funds to your HashBin balance before saving.' : 'Approve to pay this exact price and publish these bytes.');
  } catch (error) { status(error.message); }
  finally { $('review').disabled = false; $('retention').disabled = false; }
});
$('approve').addEventListener('click', async () => {
  if (!quote || busy) return;
  busy = true;
  $('approve').disabled = true;
  $('review').disabled = true;
  $('retention').disabled = true;
  $('cancel').disabled = true;
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/publish', { method: 'POST', headers: { ...headers, 'content-type': contentType, 'x-hashbin-approval': quote.approval }, body: bytes });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error);
    if (!await verifyCID(result.cid, bytes)) throw new Error('Returned content ID mismatch');
    finish(result);
  } catch (error) { status(error.message + '. Review the price again before retrying.'); }
  finally { quote = null; busy = false; $('review').disabled = false; $('retention').disabled = false; $('cancel').disabled = false; }
});

try {
  const response = await fetch('/api/publish/app?' + new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri }));
  if (!response.ok) throw new Error('This app or redirect URI is not registered.');
  app = await response.json();
  $('app').textContent = `${app.app_name} (${redirectOrigin === 'null' ? redirectUri : redirectOrigin})`;
  $('warnings').textContent = app.origin_warnings.map(warning => `Shared origin: ${warning.origin}. ${warning.apps.length} other registered apps${warning.apps.length ? ' (' + warning.apps.map(other => other.app_name).join(', ') + ')' : ''}. Apps on this origin share storage.`).join(' ');
  if (mode === 'redirect') {
    let payload;
    if (location.hash) {
      payload = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      // Social sign-in may return to this URL in a new navigation. Keep the
      // small redirect handoff first-party; popup handoffs are resent by opener.
      try {
        sessionStorage.setItem(handoffKey, JSON.stringify({ payload, createdAt: Date.now() }));
        history.replaceState(null, '', location.pathname + location.search);
      } catch { /* Preserve the fragment when session storage is unavailable. */ }
    } else {
      const stored = JSON.parse(sessionStorage.getItem(handoffKey) || 'null');
      if (!stored || Date.now() - stored.createdAt > 10 * 60 * 1000) throw new Error('Publish handoff expired. Return to the app and retry.');
      payload = stored.payload;
    }
    await accept(payload);
  } else {
    window.addEventListener('message', event => {
      if (event.source !== window.opener || event.origin !== redirectOrigin || event.data?.type !== 'hashbin:publish:request') return;
      accept(event.data).catch(error => status(error.message));
    });
    if (!window.opener) throw new Error('Popup connection unavailable. Use redirect mode.');
    window.opener.postMessage({ type: 'hashbin:publish:ready', state }, redirectOrigin);
  }
} catch (error) { status(error.message); }
