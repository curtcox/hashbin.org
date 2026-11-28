/**
 * devicebasedauth.org on the account page: link status, Link and Unlink, and the linked
 * account's credentials seen here (last use, month's spend, optional download caps).
 * Linking leaves for devicebasedauth.org and comes back to /auth/dba/callback.
 */

import { authenticatedFetch, handleApiError, showToast } from '/js/utils.js';
import { downloadApi, mountCapForm } from '/js/download-budget-ui.js';
import { getAuthState } from '/js/auth-loader.js';

const dollars = cents => `$${(cents / 100).toFixed(2)}`;

function credentialCard(credential, index) {
  const card = document.createElement('article');
  card.className = 'account-authorization-card';
  const title = document.createElement('h3');
  title.textContent = credential.credential_id;
  const scopes = document.createElement('p');
  scopes.textContent = `Grants: ${credential.scopes.length ? credential.scopes.join(', ') : 'nothing on HashBin right now'}`;
  const spend = document.createElement('p');
  spend.textContent = `Spent this month: ${dollars(credential.spend_used_cents)}` +
    (credential.monthly_spend_limit_cents === null ? ' (no monthly cap)' : ` of ${dollars(credential.monthly_spend_limit_cents)}`);
  const used = document.createElement('p');
  used.className = 'account-muted';
  used.textContent = `Last used ${credential.last_used_at ? new Date(credential.last_used_at).toLocaleString() : 'never'}` +
    (credential.expires_at ? `; this version expires ${new Date(credential.expires_at).toLocaleString()}` : '') +
    (credential.revoked ? '. Revoked at devicebasedauth.org.' : '.');
  card.append(title, scopes, spend, used);
  // The cap form finds its fields by id, so it is mounted once the card is in the page
  let mountCaps = () => {};
  if (credential.scopes.includes('downloads:spend') && !credential.revoked) {
    const caps = document.createElement('div');
    card.append(caps);
    mountCaps = () => mountCapForm(caps, `dba-download-${index}`, credential.download_caps,
      value => downloadApi(`/api/auth/dba/credentials/${encodeURIComponent(credential.credential_id)}/download-budget`, 'PUT', { caps: value }));
  }
  return { card, mountCaps };
}

async function showCredentials(container, linked) {
  container.replaceChildren();
  if (!linked) return;
  const response = await authenticatedFetch('/api/auth/dba/credentials');
  await handleApiError(response);
  const { credentials } = await response.json();
  if (!credentials.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty-state';
    empty.textContent = 'No device credentials have spent or signed downloads here yet.';
    container.append(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'account-authorizations-grid';
  const cards = credentials.map(credentialCard);
  grid.append(...cards.map(entry => entry.card));
  container.append(grid);
  for (const entry of cards) entry.mountCaps();
}

/**
 * Show the link status and wire the Link/Unlink buttons.
 * @returns {Promise<void>}
 */
export async function mountDbaLink() {
  const status = document.getElementById('dba-link-status');
  const linkButton = document.getElementById('dba-link');
  const unlinkButton = document.getElementById('dba-unlink');
  const credentials = document.getElementById('dba-credentials');
  if (!status || !linkButton || !unlinkButton) return;
  const { deviceSession } = await getAuthState();

  async function refresh() {
    try {
      const response = await authenticatedFetch('/api/auth/dba/link');
      await handleApiError(response);
      const link = await response.json();
      status.textContent = link.linked
        ? `Linked to devicebasedauth.org account ${link.account} since ${new Date(link.linked_at).toLocaleDateString()}.`
        : 'Not linked. Credentials from devicebasedauth.org are refused until you link your account.';
      linkButton.hidden = !!deviceSession;
      // The shared .btn display rule overrides the browser's default [hidden] style.
      linkButton.style.display = deviceSession ? 'none' : '';
      linkButton.textContent = link.linked ? 'Link a different account' : 'Link devicebasedauth.org';
      unlinkButton.hidden = !!deviceSession || !link.linked;
      unlinkButton.style.display = unlinkButton.hidden ? 'none' : '';
      if (deviceSession) status.textContent += ' Use regular account sign-in to change this link.';
      if (credentials) await showCredentials(credentials, link.linked);
    } catch (error) {
      status.textContent = `Could not load the devicebasedauth.org link: ${error.message}`;
    }
  }

  linkButton.addEventListener('click', async () => {
    linkButton.disabled = true;
    try {
      const response = await authenticatedFetch('/api/auth/dba/link/start', { method: 'POST' });
      await handleApiError(response);
      const { url } = await response.json();
      const target = new URL(url);
      if (target.protocol !== 'https:' && target.hostname !== 'localhost') throw new Error('Unexpected sign-in address');
      window.location.assign(target.href);
    } catch (error) {
      showToast(error.message, 'error');
      linkButton.disabled = false;
    }
  });

  unlinkButton.addEventListener('click', async () => {
    if (!window.confirm('Unlink devicebasedauth.org? Every device credential from that account stops working here at once.')) return;
    try {
      const response = await authenticatedFetch('/api/auth/dba/link', { method: 'DELETE' });
      await handleApiError(response);
      showToast('devicebasedauth.org unlinked', 'success');
      await refresh();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  const result = new URLSearchParams(window.location.search).get('dba');
  if (result === 'linked') showToast('devicebasedauth.org linked', 'success');
  await refresh();
}
