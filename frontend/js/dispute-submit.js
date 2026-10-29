/**
 * Dispute submission page (/disputes/submit.html)
 */

import {
  CLAIM_TYPE_LABELS,
  EVIDENCE_MAX,
  EVIDENCE_MIN,
  MAX_EVIDENCE_URLS,
  NCII_CLAIM_TYPE,
  describeDisputeError,
  formatDisputeDate,
  validateDisputeForm
} from './disputes.js';

const form = document.getElementById('dispute-form');
const errorBox = document.getElementById('form-error');
const evidenceInput = document.getElementById('evidence');
const evidenceCount = document.getElementById('evidence-count');
const urlList = document.getElementById('url-list');
const addUrlButton = document.getElementById('add-url');
const contactInput = document.getElementById('contact_value');
const submitButton = document.getElementById('submit-button');
const claimSelect = document.getElementById('claim_type');
const nciiFields = document.getElementById('ncii-fields');

const params = new URLSearchParams(window.location.search);
if (params.get('cid')) {
  document.getElementById('cid').value = params.get('cid');
}
if (CLAIM_TYPE_LABELS[params.get('reason')]) {
  claimSelect.value = params.get('reason');
}

function isNcii() {
  return claimSelect.value === NCII_CLAIM_TYPE;
}

function updateClaimFields() {
  nciiFields.classList.toggle('hidden', !isNcii());
  document.getElementById('evidence-optional').classList.toggle('hidden', !isNcii());
  updateEvidenceCount();
}

function showErrors(messages) {
  errorBox.replaceChildren();
  if (messages.length === 1) {
    errorBox.textContent = messages[0];
  } else {
    const list = document.createElement('ul');
    for (const message of messages) {
      const item = document.createElement('li');
      item.textContent = message;
      list.appendChild(item);
    }
    errorBox.appendChild(list);
  }
  errorBox.classList.remove('hidden');
  errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearErrors() {
  errorBox.classList.add('hidden');
  errorBox.replaceChildren();
}

function updateEvidenceCount() {
  const length = evidenceInput.value.trim().length;
  const min = isNcii() ? 0 : EVIDENCE_MIN;
  evidenceCount.textContent = `${length.toLocaleString('en-US')} / ${EVIDENCE_MAX.toLocaleString('en-US')}${min ? ` (minimum ${min})` : ''}`;
  evidenceCount.classList.toggle('invalid', length > 0 && (length < min || length > EVIDENCE_MAX));
}

function addUrlRow() {
  if (urlList.children.length >= MAX_EVIDENCE_URLS) return;

  const row = document.createElement('div');
  row.className = 'url-row';

  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'form-input evidence-url';
  input.placeholder = 'https://';
  input.setAttribute('aria-label', 'Supporting link');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-secondary btn-sm';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    row.remove();
    addUrlButton.disabled = false;
  });

  row.append(input, remove);
  urlList.appendChild(row);
  addUrlButton.disabled = urlList.children.length >= MAX_EVIDENCE_URLS;
  input.focus();
}

function selectedContactType() {
  return form.querySelector('input[name="contact_type"]:checked')?.value;
}

function updateContactPlaceholder() {
  const isEmail = selectedContactType() === 'email';
  contactInput.placeholder = isEmail ? 'you@example.com' : 'https://example.com/contact';
  contactInput.autocomplete = isEmail ? 'email' : 'url';
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();

  const { errors, payload } = validateDisputeForm({
    cid: document.getElementById('cid').value,
    claimType: claimSelect.value,
    evidence: evidenceInput.value,
    evidenceUrls: [...urlList.querySelectorAll('.evidence-url')].map(input => input.value),
    contactType: selectedContactType(),
    contactValue: contactInput.value,
    goodFaith: document.getElementById('good_faith').checked,
    reporterRole: form.querySelector('input[name="reporter_role"]:checked')?.value,
    nciiStatement: document.getElementById('ncii_statement').checked,
    signature: document.getElementById('signature').value
  });

  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';

  try {
    const response = await fetch('/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      showErrors([describeDisputeError(response.status, body)]);
      return;
    }

    const dispute = body.dispute || {};
    document.getElementById('success-id').textContent = dispute.dispute_id || '';
    document.getElementById('success-expires').textContent = formatDisputeDate(dispute.expires_at);
    document.getElementById('success-due').textContent = dispute.removal_due_at
      ? new Date(dispute.removal_due_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    const ncii = payload.claim_type === NCII_CLAIM_TYPE;
    document.getElementById('success-standard').classList.toggle('hidden', ncii || !dispute.expires_at);
    document.getElementById('success-open').classList.toggle('hidden', ncii || !!dispute.expires_at);
    document.getElementById('success-ncii').classList.toggle('hidden', !ncii);
    document.getElementById('success-view').href = `/disputes/view.html?cid=${encodeURIComponent(payload.cid)}`;
    form.classList.add('hidden');
    document.getElementById('success').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Dispute submission failed:', error);
    showErrors(['Network error. Please check your connection and try again.']);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit report';
  }
}

evidenceInput.addEventListener('input', updateEvidenceCount);
claimSelect.addEventListener('change', updateClaimFields);
addUrlButton.addEventListener('click', addUrlRow);
form.querySelectorAll('input[name="contact_type"]').forEach(radio => {
  radio.addEventListener('change', updateContactPlaceholder);
});
form.addEventListener('submit', handleSubmit);
updateClaimFields();
