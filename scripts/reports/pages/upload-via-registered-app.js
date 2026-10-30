import { hashbin } from './sdk/hashbin.js';

const HASHBIN_BASE = 'https://hashbin.org';
const CLIENT_ID_KEY = 'hashbin:ghpages:registered-app-client-id';

const clientIdInput = document.getElementById('client-id');
const saveClientIdButton = document.getElementById('save-client-id');
const uploadButton = document.getElementById('upload-button');
const fileInput = document.getElementById('content-file');
const statusEl = document.getElementById('status');
const redirectUriNote = document.getElementById('redirect-uri-note');

function getRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function setStatus(message, type = 'info') {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
}

function getClientId() {
  return clientIdInput.value.trim();
}

function saveClientId() {
  const clientId = getClientId();
  if (!clientId) {
    setStatus('Client ID is required.', 'error');
    return false;
  }
  localStorage.setItem(CLIENT_ID_KEY, clientId);
  setStatus('Client ID saved.', 'success');
  return true;
}

function configureClient() {
  const clientId = getClientId();
  if (!clientId) {
    setStatus('Enter a client ID first.', 'error');
    return null;
  }

  localStorage.setItem(CLIENT_ID_KEY, clientId);
  return hashbin.configure({
    clientId,
    redirectUri: getRedirectUri(),
    baseUrl: HASHBIN_BASE
  });
}

function showResult(result) {
  const expires = result.expires_at ? `\nExpires: ${new Date(result.expires_at).toISOString()}` : '';
  setStatus(
    `Upload complete.\nCID: ${result.cid}${expires}\n\nView content: https://256t.us/${result.cid}\nInspect metadata: ${HASHBIN_BASE}/info/${result.cid}`,
    'success'
  );
}

function failureMessage(error) {
  if (error.message === 'access_denied') return 'The upload was cancelled on HashBin.';
  if (error.message === 'Publish window closed.') return 'The HashBin window was closed before the upload was approved.';
  return `Upload failed: ${error.message}`;
}

// Opens hashbin.org's approval window, so it must run synchronously in the click. A blocked window
// falls back to a redirect, which comes back through handlePublishReturn().
function upload() {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    setStatus('Choose a file to upload.', 'error');
    return;
  }
  if (!configureClient()) {
    return;
  }

  uploadButton.disabled = true;
  setStatus(`Approve the upload of ${file.name} in the HashBin window...`, 'info');
  hashbin.publish(file, { contentType: file.type || 'application/octet-stream', fileName: file.name })
    .finally(() => { uploadButton.disabled = false; })
    .then((result) => { if (!result.redirected) showResult(result); }, (error) => setStatus(failureMessage(error), 'error'));
}

async function handlePublishReturn() {
  if (!new URLSearchParams(window.location.hash.slice(1)).has('hashbin_publish')) {
    return;
  }
  const hash = window.location.hash;
  window.history.replaceState({}, document.title, getRedirectUri());
  if (!configureClient()) {
    return;
  }
  try {
    showResult(await hashbin.handlePublishCallback({ hash }));
  } catch (error) {
    setStatus(failureMessage(error), 'error');
  }
}

// Earlier versions of this page kept OAuth tokens on this shared github.io origin. Revoke them on
// hashbin.org; clearing them alone would leave a copy another page took still valid.
async function retireLegacyTokens() {
  if (!getClientId() || !configureClient()?.getTokens()?.refreshToken) {
    return;
  }
  try {
    await hashbin.disconnect();
  } catch (_error) {
    // Retried on the next visit.
  }
}

const storedClientId = localStorage.getItem(CLIENT_ID_KEY);
if (storedClientId) {
  clientIdInput.value = storedClientId;
}

redirectUriNote.textContent = `Register this exact redirect URI in your app: ${getRedirectUri()}`;

saveClientIdButton.addEventListener('click', saveClientId);
uploadButton.addEventListener('click', upload);

await handlePublishReturn();
retireLegacyTokens();
