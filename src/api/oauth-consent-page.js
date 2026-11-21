/**
 * The OAuth consent page (GET /oauth/authorize): validates the request and renders the
 * screen where the user narrows and approves an app's access. Approval posts to
 * handleOAuthAuthorize in oauth.js.
 */
import { SPENDING_SCOPES, scopeDescription } from '../auth/scopes.js';
import { GRANT_EXPIRY_CHOICES_DAYS, getApplication, validateAuthorizeRequest } from './oauth.js';

// Fuller wording for the consent page where the shared description is too terse
const CONSENT_DESCRIPTIONS = {
  'downloads:spend': 'Pay for downloads from your balance, within your account and app download caps. Downloads stay disabled until both caps are configured in Account settings.',
  'content:write': 'Publish immutable content using your account balance and default retention.'
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON for embedding in an inline <script>; escaping < keeps a value such as
// "</script>" in the state parameter from closing the script element.
function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

export async function handleGetOAuthAuthorizePage(request, env) {
  const url = new URL(request.url);
  const app = await getApplication(env, url.searchParams.get('client_id'));
  const requestData = {
    client_id: url.searchParams.get('client_id'),
    redirect_uri: url.searchParams.get('redirect_uri'),
    response_type: url.searchParams.get('response_type'),
    scope: url.searchParams.get('scope') || '',
    state: url.searchParams.get('state') || '',
    code_challenge: url.searchParams.get('code_challenge'),
    code_challenge_method: url.searchParams.get('code_challenge_method'),
    spending_limit: url.searchParams.get('spending_limit'),
    max_retention_months: url.searchParams.get('max_retention_months'),
    dpop_jkt: url.searchParams.get('dpop_jkt'),
    max_upload_bytes: url.searchParams.get('max_upload_bytes')
  };
  const validation = validateAuthorizeRequest(requestData, app);

  if (!validation.valid) {
    return htmlResponse(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unable to Continue - HashBin.org</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f7fb; color: #1f2937; margin: 0; padding: 2rem; }
    .shell { max-width: 720px; margin: 4rem auto; background: white; border-radius: 18px; padding: 2rem; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08); }
    .eyebrow { color: #b91c1c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem; font-weight: 700; }
    h1 { margin: 0.75rem 0 1rem; font-size: 2rem; }
    p { color: #4b5563; line-height: 1.6; }
    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="eyebrow">Authorization Error</div>
    <h1>Unable to Continue</h1>
    <p>${escapeHtml(validation.message)}</p>
    <p>Error code: <code>${escapeHtml(validation.error)}</code></p>
  </div>
</body>
</html>`, 400);
  }

  requestData.spending_limit = validation.spendingLimit;
  requestData.max_retention_months = validation.maxRetention;
  requestData.max_upload_bytes = validation.maxUpload;
  const spends = validation.scopes.some((scope) => SPENDING_SCOPES.has(scope));

  // Each requested permission can be unchecked; limits can be lowered, never raised
  const scopesHtml = validation.scopes.map((scope) => `
      <li>
        <label><input type="checkbox" class="grant-scope" value="${escapeHtml(scope)}" checked> <strong>${escapeHtml(scope)}</strong></label>
        <span>${escapeHtml(CONSENT_DESCRIPTIONS[scope] || scopeDescription(scope))}</span>
      </li>`).join('');

  const sharedWarning = (app.origin_warnings || []).map(warning => `<p role="note">This app runs on <strong>${escapeHtml(warning.origin)}</strong>, which also hosts ${warning.apps.length} other HashBin apps${warning.apps.length ? ': ' + warning.apps.map(other => escapeHtml(other.app_name)).join(', ') : ''}. Any app on this origin could use what you approve here. Prefer a small spending cap and short expiry, or per-save approval. <a href="/docs/browser-client-safety">Browser client safety guide</a>.</p>`).join('');
  const limitsHtml = `
        <h2>Limits</h2>
        <div class="limits">
          <label>Monthly spending limit (US dollars)${spends ? ' *' : ''}
            <input id="grant-spend" type="number" min="0.01" step="0.01"${validation.spendingLimit === null ? '' : ` max="${validation.spendingLimit}" value="${validation.spendingLimit}"`}>
          </label>
          <p class="hint">${spends ? 'Required: this app can spend from your balance. ' : ''}${validation.spendingLimit === null ? '' : `The app asked for up to $${validation.spendingLimit.toFixed(2)}; you can lower it.`}</p>
          <label>Longest retention per upload (months)${validation.maxRetention === null ? '' : ' *'}
            <input id="grant-retention" type="number" min="1" max="${validation.maxRetention ?? 120}" step="1"${validation.maxRetention === null ? '' : ` value="${validation.maxRetention}"`}>
          </label>
          <p class="hint">Empty means your default retention applies.</p>
          <label>Maximum file size (bytes)
            <input id="grant-upload" type="number" min="1" max="${validation.maxUpload ?? 5242880}" step="1" value="${validation.maxUpload ?? 1048576}">
          </label>
          <label>Access expires
            <select id="grant-expiry">
              <option value="">When you revoke it</option>
              ${GRANT_EXPIRY_CHOICES_DAYS.map((days) => `<option value="${days}"${days === 30 ? ' selected' : ''}>In ${days} days</option>`).join('')}
            </select>
          </label>
        </div>`;

  return htmlResponse(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize ${escapeHtml(app.app_name)} - HashBin.org</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #13233a;
      --muted: #5f6f87;
      --paper: #ffffff;
      --sky: #edf6ff;
      --accent: #0f766e;
      --accent-2: #f59e0b;
      --line: #d8e4f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(245,158,11,0.20), transparent 28%),
        radial-gradient(circle at top right, rgba(15,118,110,0.18), transparent 30%),
        linear-gradient(180deg, #f6fbff, #eef4fb 46%, #f8f4eb 100%);
      padding: 2rem;
    }
    .sheet {
      max-width: 880px;
      margin: 2rem auto;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(216,228,242,0.9);
      border-radius: 28px;
      box-shadow: 0 30px 80px rgba(19,35,58,0.12);
      overflow: hidden;
    }
    .hero {
      padding: 2rem 2rem 1rem;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(237,246,255,0.95));
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.78rem;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 0.75rem;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 3.25rem);
      line-height: 1.05;
    }
    .hero p {
      max-width: 44rem;
      color: var(--muted);
      font-size: 1.02rem;
      line-height: 1.7;
      margin: 1rem 0 0;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 0;
    }
    .panel {
      padding: 2rem;
    }
    .panel + .panel {
      border-left: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(248,250,252,0.7), rgba(237,246,255,0.55));
    }
    h2 {
      margin: 0 0 1rem;
      font-size: 1.15rem;
      letter-spacing: 0.01em;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.9rem;
    }
    li {
      padding: 1rem 1rem 0.95rem;
      border-radius: 18px;
      background: white;
      border: 1px solid var(--line);
      box-shadow: 0 10px 24px rgba(19,35,58,0.05);
    }
    li strong {
      display: block;
      font-size: 1rem;
      margin-bottom: 0.35rem;
    }
    li span {
      display: block;
      color: var(--muted);
      line-height: 1.55;
      font-size: 0.95rem;
    }
    dl { margin: 0; display: grid; gap: 1rem; }
    dt { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.25rem; }
    dd { margin: 0; font-size: 1rem; line-height: 1.55; word-break: break-word; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.9rem;
      margin-top: 1.5rem;
    }
    button {
      border: none;
      border-radius: 999px;
      padding: 0.95rem 1.4rem;
      font-size: 0.98rem;
      font-weight: 700;
      cursor: pointer;
    }
    .approve { background: var(--ink); color: white; }
    .deny { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    ul + h2 { margin-top: 1.75rem; }
    .limits { display: grid; gap: 0.5rem; }
    .limits label { display: grid; gap: 0.35rem; font-weight: 700; }
    .limits input, .limits select { font: inherit; padding: 0.6rem 0.75rem; border: 1px solid var(--line); border-radius: 12px; }
    .hint { color: var(--muted); margin: 0 0 0.5rem; font-size: 0.92rem; }
    li label { display: flex; gap: 0.5rem; align-items: center; }
    .status {
      margin-top: 1rem;
      min-height: 1.5rem;
      color: var(--muted);
      font-size: 0.95rem;
    }
    @media (max-width: 860px) {
      body { padding: 1rem; }
      .grid { grid-template-columns: 1fr; }
      .panel + .panel { border-left: none; border-top: 1px solid var(--line); }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <section class="hero">
      <div class="eyebrow">Third-Party Publishing</div>
      <h1>${escapeHtml(app.app_name)} wants to use your HashBin account.</h1>
      <p>
        Review the requested access below. Uncheck anything you don't want to give, and set limits; the app gets only what you approve.
      </p>
    </section>
    <div class="grid">
      <section class="panel">
        <h2>Requested permissions</h2>
        <ul>${scopesHtml}</ul>
        ${limitsHtml}
        ${validation.scopes.includes('downloads:spend') ? '<p id="download-consent-budget">Download spending requires enabled account and app daily/monthly caps. Sign in to see current caps.</p>' : ''}
      </section>
      <aside class="panel">
        <h2>App details</h2>
        ${sharedWarning}
        <dl>
          <div>
            <dt>Application</dt>
            <dd>${escapeHtml(app.app_name)}</dd>
          </div>
          <div>
            <dt>Redirect URI</dt>
            <dd>${escapeHtml(requestData.redirect_uri)}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>${escapeHtml(requestData.state || '(none)')}</dd>
          </div>
        </dl>
        <div class="actions">
          <button class="approve" id="approve-button">Approve access</button>
          <button class="deny" id="deny-button">Deny</button>
        </div>
        <div class="status" id="status-message">Sign in to HashBin if prompted, then approve to continue.</div>
      </aside>
    </div>
  </div>
  <script type="module">
    import { initializeAuth, getAuthHeaders, signIn } from '/js/auth-loader.js';

    const authorizePayload = ${scriptJson(requestData)};
    const statusMessage = document.getElementById('status-message');
    const approveButton = document.getElementById('approve-button');
    const denyButton = document.getElementById('deny-button');

    async function showDownloadCaps() {
      const status = document.getElementById('download-consent-budget');
      if (!status) return;
      try {
        await initializeAuth();
        const headers = await getAuthHeaders();
        if (!headers) return;
        const [budgetResponse, grantsResponse] = await Promise.all([
          fetch('/api/downloads/budget', { headers }), fetch('/api/account/authorizations', { headers })
        ]);
        if (!budgetResponse.ok || !grantsResponse.ok) return;
        const budget = await budgetResponse.json();
        const grants = await grantsResponse.json();
        const grant = grants.authorizations?.find(entry => entry.app_id === authorizePayload.client_id);
        const format = caps => caps ? ('$' + (caps.daily_cap_cents / 100).toFixed(2) + '/day, $' + (caps.monthly_cap_cents / 100).toFixed(2) + '/month') : 'off (enable caps in Account settings)';
        status.textContent = 'Download caps — account: ' + format(budget.account) + '; app: ' + format(budget.keys[grant?.grant_id]) + '. Both apply, plus the app monthly spending limit. UTC windows.';
      } catch { /* The static explanation remains visible when signed out. */ }
    }
    showDownloadCaps();

    function redirectDenied() {
      const deniedUrl = new URL(authorizePayload.redirect_uri);
      deniedUrl.searchParams.set('error', 'access_denied');
      if (authorizePayload.state) {
        deniedUrl.searchParams.set('state', authorizePayload.state);
      }
      window.location.href = deniedUrl.toString();
    }

    denyButton.addEventListener('click', () => {
      redirectDenied();
    });

    approveButton.addEventListener('click', async () => {
      approveButton.disabled = true;
      statusMessage.textContent = 'Checking your session...';

      try {
        await initializeAuth();
        let authHeaders = await getAuthHeaders();

        if (!authHeaders) {
          statusMessage.textContent = 'Sign-in is required before you can approve this request.';
          await signIn();
          authHeaders = await getAuthHeaders();
        }

        if (!authHeaders) {
          approveButton.disabled = false;
          return;
        }

        const optional = (id) => document.getElementById(id).value.trim() || null;
        const grantedScopes = [...document.querySelectorAll('.grant-scope:checked')].map((box) => box.value);
        if (!grantedScopes.length) {
          statusMessage.textContent = 'Keep at least one permission, or choose Deny.';
          approveButton.disabled = false;
          return;
        }

        statusMessage.textContent = 'Authorizing application...';
        const response = await fetch('/oauth/authorize', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            ...authorizePayload,
            granted_scopes: grantedScopes,
            granted_spending_limit: optional('grant-spend'),
            granted_max_retention_months: optional('grant-retention'),
            expires_in_days: optional('grant-expiry'),
            granted_max_upload_bytes: optional('grant-upload')
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.redirect_to) {
            window.location.href = result.redirect_to;
            return;
          }
        }

        let errorMessage = 'Authorization failed.';
        try {
          const errorData = await response.json();
          const statusLabel = response.status ? ('HTTP ' + response.status) : 'HTTP error';
          const primary = errorData.message || errorData.error || errorMessage;
          const details = errorData.details ? (' Details: ' + errorData.details) : '';
          const requestId = errorData.request_id ? (' Request ID: ' + errorData.request_id) : '';
          errorMessage = primary + ' (' + statusLabel + ').' + details + requestId;
        } catch (_error) {
          errorMessage = 'Authorization failed (HTTP ' + response.status + '). The server returned a non-JSON error response.';
        }

        statusMessage.textContent = errorMessage;
        approveButton.disabled = false;
      } catch (error) {
        statusMessage.textContent = error.message || 'Authorization failed.';
        approveButton.disabled = false;
      }
    });
  </script>
</body>
</html>`);
}
