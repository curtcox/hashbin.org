/**
 * /auth/dba/callback: devicebasedauth.org returns here with ?code&state (or ?error) after the
 * user approves linking. The server holds the matching state and PKCE verifier, so this page
 * only forwards what it was given, then goes back to the account page.
 */

import { requireAuth } from '/js/auth-gate.js';
import { authenticatedFetch } from '/js/utils.js';
import { renderNavHeader } from '/js/nav-header.js';

const status = document.getElementById('dba-callback-status');
const params = new URLSearchParams(window.location.search);
const body = {};
for (const name of ['code', 'state', 'error']) if (params.has(name)) body[name] = params.get(name);
// Keep the one-time code out of history and out of any later page's Referer.
window.history.replaceState(null, '', window.location.pathname);

renderNavHeader();
if (await requireAuth()) {
  try {
    if (!body.state) throw new Error('This page needs the response from devicebasedauth.org. Start linking from Account Settings.');
    const response = await authenticatedFetch('/api/auth/dba/link/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || `Linking failed (HTTP ${response.status})`);
    status.textContent = `Linked devicebasedauth.org account ${result.account}. Returning to Account Settings…`;
    window.location.replace('/account?dba=linked#dba');
  } catch (error) {
    status.textContent = error.message;
  }
}
