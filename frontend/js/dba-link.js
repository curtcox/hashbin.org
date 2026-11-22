/**
 * devicebasedauth.org account link on the account page: status, Link and Unlink.
 * Linking leaves for devicebasedauth.org and comes back to /auth/dba/callback.
 */

import { authenticatedFetch, handleApiError, showToast } from '/js/utils.js';

/**
 * Show the link status and wire the Link/Unlink buttons.
 * @returns {Promise<void>}
 */
export async function mountDbaLink() {
  const status = document.getElementById('dba-link-status');
  const linkButton = document.getElementById('dba-link');
  const unlinkButton = document.getElementById('dba-unlink');
  if (!status || !linkButton || !unlinkButton) return;

  async function refresh() {
    try {
      const response = await authenticatedFetch('/api/auth/dba/link');
      await handleApiError(response);
      const link = await response.json();
      status.textContent = link.linked
        ? `Linked to devicebasedauth.org account ${link.account} since ${new Date(link.linked_at).toLocaleDateString()}.`
        : 'Not linked. Credentials from devicebasedauth.org are refused until you link your account.';
      linkButton.hidden = false;
      linkButton.textContent = link.linked ? 'Link a different account' : 'Link devicebasedauth.org';
      unlinkButton.hidden = !link.linked;
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
