// Registered-app safety check (H4): reads an app's published page and its same-origin scripts and
// reports the problems documented in /docs/security/. Findings are advice for the developer; they
// never block publishing.
import { originWarnings, webOrigin } from './auth/shared-origins.js';

export const LATEST_SDK = 'v0.3.0';
const MAX_BYTES = 1024 * 1024;
const MAX_SCRIPTS = 12;
const NOTES = '/docs/security/';

function finding(level, id, message, link = '/docs/browser-client-safety') {
  return { level, id, message, link };
}

/** The effective Content-Security-Policy text from a header or meta tag, or null. */
export function contentSecurityPolicy(html, headers = {}) {
  const header = headers['content-security-policy'];
  if (header) return header;
  const meta = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i.exec(html)?.[0];
  return meta ? /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(meta)?.slice(1).find(Boolean) || null : null;
}

function directive(policy, name) {
  const match = policy.split(';').map(part => part.trim().split(/\s+/)).find(([key]) => key?.toLowerCase() === name);
  return match ? match.slice(1) : null;
}

/** Same-origin script URLs the page loads, resolved against the page. */
export function scriptUrls(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map(match => { try { return new URL(match[1], pageUrl); } catch { return null; } })
    .filter(url => url && url.origin === origin).map(url => url.href);
}

/**
 * Analyse one page. `scripts` maps same-origin script URLs to their text, and `serviceWorker` is
 * the registered worker's text when one was found. `apps` is the registry, for shared origins.
 */
export function analyzePage({ url, html, headers = {}, scripts = {}, serviceWorker = null, apps = [], appId = null }) {
  const findings = [];
  const code = [html, ...Object.values(scripts)].join('\n');
  const shared = originWarnings([url], apps, appId)[0];
  if (shared) findings.push(finding('warn', 'shared-origin', `${shared.origin} is shared${shared.known_shared_host ? ' by every project on this host' : ` with ${shared.apps.length} other registered app(s)`}. Other apps there can read this app's storage and caches, so keep no HashBin credential here and isolate code you run.`, `${NOTES}sn-2026-003`));

  const policy = contentSecurityPolicy(html, headers);
  if (!policy) findings.push(finding('warn', 'csp-missing', 'No Content-Security-Policy. Keep scripts in files and restrict script-src to your site and pinned paths.'));
  else {
    const scriptSrc = directive(policy, 'script-src') || directive(policy, 'default-src') || [];
    if (scriptSrc.includes("'unsafe-inline'") && !scriptSrc.some(source => /^'(nonce|sha(256|384|512))-/.test(source))) findings.push(finding('warn', 'csp-unsafe-inline', "script-src allows 'unsafe-inline', so injected inline scripts run."));
    if (scriptSrc.includes("'unsafe-eval'")) findings.push(finding('info', 'csp-unsafe-eval', "script-src allows 'unsafe-eval'. Prefer 'wasm-unsafe-eval' if only WebAssembly needs it."));
    if (scriptSrc.some(source => source === '*' || source === 'https:' || source === 'http:')) findings.push(finding('warn', 'csp-wildcard', 'script-src allows scripts from any host.'));
    if (!directive(policy, 'object-src') && !directive(policy, 'default-src')) findings.push(finding('info', 'csp-object-src', "Add object-src 'none'."));
    if (!headers['content-security-policy'] && /frame-ancestors/i.test(policy)) findings.push(finding('info', 'csp-meta-frame-ancestors', 'frame-ancestors has no effect in a meta tag; send it as a response header.'));
    findings.push(finding('ok', 'csp-present', 'A Content-Security-Policy is present.'));
  }
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*\S/i.test(html)) findings.push(finding('info', 'inline-script', 'The page has inline scripts. Move them to files so the policy can forbid inline script.'));

  const sdk = [...code.matchAll(/hashbin\.org\/sdk\/(v\d+\.\d+\.\d+\/)?hashbin\.js/g)].map(match => match[1]?.slice(0, -1) || 'latest');
  const vendored = [...code.matchAll(/hashbin-sdk-(v\d+\.\d+\.\d+)\.m?js/g)].map(match => match[1]);
  for (const version of new Set([...sdk, ...vendored])) {
    if (version === 'latest') findings.push(finding('info', 'sdk-unpinned', 'The page imports the unversioned SDK, which updates automatically. Pin a release for apps that spend money.', '/docs/sdk#load'));
    else if (version !== LATEST_SDK) findings.push(finding('info', 'sdk-outdated', `The page uses SDK ${version}; ${LATEST_SDK} is current. Upgrade deliberately to get its fixes.`, '/docs/sdk#load'));
    else findings.push(finding('ok', 'sdk-current', `The page uses the current SDK release (${version}).`, '/docs/sdk#load'));
  }
  if (/hashbin:tokens:|\.authorize\(/.test(code) && shared) findings.push(finding('warn', 'allowance-on-shared-origin', 'The page appears to use an allowance (stored tokens) on a shared origin. Prefer per-save approval with publish().', `${NOTES}sn-2026-003`));

  // Where untrusted code runs: same-origin workers and frames keep this origin's storage.
  if (/allow-scripts[^"'>]*allow-same-origin|allow-same-origin[^"'>]*allow-scripts/.test(code)) findings.push(finding('warn', 'sandbox-same-origin', 'An iframe combines allow-scripts with allow-same-origin, which lets its content remove the sandbox.', `${NOTES}sn-2026-001`));
  if (/new\s+(Shared)?Worker\s*\(/.test(code) && !/createSandbox\s*\(/.test(code)) findings.push(finding('info', 'worker-origin', 'The page starts workers with its own origin. If they run code from users or links, run it with createSandbox() instead.', `${NOTES}sn-2026-001`));
  if (/createSandbox\s*\(/.test(code)) findings.push(finding('ok', 'sandbox', 'Code runs in the SDK sandbox (opaque origin).', '/docs/sdk#sandbox'));

  if (serviceWorker !== null) {
    if (/HashBinCache|crypto\.subtle\.digest\(\s*['"]SHA-256/.test(serviceWorker)) findings.push(finding('ok', 'sw-verified', 'The service worker verifies cached bytes.', '/docs/sdk#offline-cache'));
    else if (shared) findings.push(finding('warn', 'sw-unverified', 'The service worker caches files without checking hashes. Other apps on this origin can write its Cache Storage.', '/docs/sdk#offline-cache'));
  }
  return findings;
}

function publicHttps(uri) {
  try {
    const url = new URL(uri);
    // Loopback and literal addresses are local development callbacks, not published pages.
    return url.protocol === 'https:' && !/^(localhost|\[.*\]|\d+\.\d+\.\d+\.\d+)$/.test(url.hostname) && !url.hostname.endsWith('.localhost') ? url : null;
  } catch { return null; }
}

async function readText(fetchImpl, url, accept) {
  const response = await fetchImpl(url, { headers: { accept, 'user-agent': 'HashBin app safety check (+https://hashbin.org/docs/security/)' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return { text: text.slice(0, MAX_BYTES), headers: Object.fromEntries([...response.headers].map(([key, value]) => [key.toLowerCase(), value])) };
}

/** Fetch and analyse every published redirect URI of one app. */
export async function checkApp(app, apps, { fetch: fetchImpl = fetch, now = new Date() } = {}) {
  const pages = [];
  const seen = new Set();
  for (const uri of app.redirect_uris || []) {
    const url = publicHttps(uri);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    try {
      const page = await readText(fetchImpl, url.href, 'text/html');
      const scripts = {};
      for (const scriptUrl of scriptUrls(page.text, url.href).slice(0, MAX_SCRIPTS)) {
        try { scripts[scriptUrl] = (await readText(fetchImpl, scriptUrl, '*/*')).text; } catch { /* Missing scripts are not findings. */ }
      }
      const code = [page.text, ...Object.values(scripts)].join('\n');
      const registration = /serviceWorker\s*\.\s*register\(\s*['"]([^'"]+)['"]/.exec(code)?.[1];
      let serviceWorker = null;
      if (registration) try { serviceWorker = (await readText(fetchImpl, new URL(registration, url).href, '*/*')).text; } catch { /* Reported as unverified only when readable. */ }
      pages.push({ url: url.href, findings: analyzePage({ url: url.href, html: page.text, headers: page.headers, scripts, serviceWorker, apps, appId: app.app_id }) });
    } catch (error) {
      pages.push({ url: url.href, error: `Could not read the page: ${error.message}` });
    }
  }
  const skipped = (app.redirect_uris || []).filter(uri => !publicHttps(uri) && webOrigin(uri));
  return { app_id: app.app_id, checked_at: now.toISOString(), pages, skipped };
}
