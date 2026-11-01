import { requireAuth } from './auth-gate.js';
import { authenticatedFetch, formatBalance } from './utils.js';

const el = id => document.getElementById(id);
let state, editing = null;
let pendingPurchase = null;

async function api(path, method = 'GET', data) {
  const response = await authenticatedFetch(`/api/user/aliases${path}`, { method,
    ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.error || 'Request failed');
  return result;
}

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function price() {
  if (!state) return;
  el('alias-price').textContent = editing?.mode === 'value' ? 'Changing the CID is free.' :
    `${formatBalance(state.monthly_price_cents * Number(el('alias-months').value))} from balance (${formatBalance(state.monthly_price_cents)} per month).`;
}

function edit(alias, mode) {
  editing = alias ? { alias, mode } : null;
  pendingPurchase = null;
  el('alias-form-title').textContent = alias ? `${mode === 'renew' ? 'Renew' : 'Edit'} @${alias.name}` : 'Add a personal alias';
  el('alias-name').value = alias?.name || '';
  el('alias-name').disabled = Boolean(alias);
  el('alias-cid').value = alias?.cid || new URLSearchParams(location.search).get('cid') || '';
  el('alias-cid').disabled = mode === 'renew';
  el('alias-months-label').hidden = mode === 'value';
  el('alias-months').disabled = mode === 'value';
  el('alias-months').value = alias?.renewal_months || 12;
  el('alias-current').hidden = !alias;
  el('alias-current').textContent = alias ? `Currently points to ${alias.cid}` : '';
  el('alias-submit').textContent = mode === 'renew' ? 'Renew alias' : alias ? 'Save CID' : 'Create alias';
  el('alias-cancel').hidden = !alias;
  el('alias-warning').textContent = '';
  price();
}

async function globalApi(name, action, method = 'POST', data) {
  const response = await authenticatedFetch(`/api/aliases/${encodeURIComponent(name)}/${action}`, { method,
    ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function button(label, callback) {
  const element = node('button', label, 'btn btn-secondary'); element.type = 'button';
  element.addEventListener('click', () => action(async () => { element.disabled = true; try { await callback(); } finally { element.disabled = false; } }));
  return element;
}

function renderGlobal() {
  const list = el('global-alias-list'); list.replaceChildren();
  if (!state.global.length) list.append(node('p', 'You own no global names.'));
  for (const alias of state.global) {
    const card = node('article', undefined, 'card'); const title = node('a', `@${alias.name}`);
    title.href = `/aliases/view.html?name=${encodeURIComponent(alias.name)}`;
    card.append(title, node('p', `Paid through: ${alias.paid_through ? new Date(alias.paid_through).toLocaleString() : 'Finishing registration…'}`), node('p', alias.cid || '', 'alias-cid'));
    const controls = node('div', undefined, 'alias-actions');
    controls.append(button('Change CID', async () => {
      const cid = prompt(`Currently points to ${alias.cid}. Enter the new CID. Changes can take up to a minute.`, alias.cid);
      if (cid && cid !== alias.cid) {
        await globalApi(alias.name, 'value', 'PUT', { cid, request_id: crypto.randomUUID() });
        const response = await authenticatedFetch(`/api/content/${encodeURIComponent(cid)}`);
        if (!response.ok) return 'Saved. This CID is not stored on HashBin; inline CIDs or other suppliers may still work. Resolution changes can take up to a minute.';
        const metadata = await response.json();
        if (metadata.expires_at && Date.parse(metadata.expires_at) < Date.parse(alias.paid_through)) return 'Saved. The content expires before this alias; renewing an alias does not extend retention.';
      }
    }), button('Renew', async () => { location.href = title.href; }),
    button(alias.auto_renew ? 'Disable auto-renew' : 'Enable auto-renew', async () => {
      if (!alias.auto_renew && !confirm('Prepay the previous renewal term from balance 7 days before expiry?')) return;
      const response = await authenticatedFetch(`/api/aliases/${alias.name}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_renew: !alias.auto_renew }) });
      if (!response.ok) throw new Error((await response.json()).error);
    }), button(alias.listing_price_cents ? `Change listing (${formatBalance(alias.listing_price_cents)})` : 'List for sale', async () => {
      const input = prompt(`Price in cents (minimum 100). Fee ${Math.round(alias.sale_fee_rate * 100)}%, minimum ${formatBalance(alias.minimum_sale_fee_cents)}.`, alias.listing_price_cents || 100);
      if (input !== null) await globalApi(alias.name, 'listing', 'PUT', { price_cents: Number(input) });
    }));
    if (alias.listing_price_cents) controls.append(button('Remove listing', () => globalApi(alias.name, 'listing', 'DELETE')));
    const offers = node('div');
    const viewOffers = node('button', `Incoming offers (${alias.incoming_offers || 0})`, 'btn btn-secondary'); viewOffers.type = 'button';
    viewOffers.addEventListener('click', async () => {
      try {
        const result = await globalApi(alias.name, 'offers', 'GET'); offers.replaceChildren();
        if (!result.offers.length) offers.append(node('p', 'No open offers.'));
        for (const offer of result.offers) {
          const row = node('p', `${formatBalance(offer.amount_cents)} · expires ${new Date(offer.expires_at).toLocaleString()} `);
          for (const decision of ['accept', 'decline']) row.append(button(decision === 'accept' ? 'Accept' : 'Decline', async () => {
            if (!confirm(`${decision === 'accept' ? 'Sell this name for' : 'Decline'} ${formatBalance(offer.amount_cents)}?`)) return;
            await globalApi(alias.name, `offers/${offer.id}/${decision}`, 'POST', { request_id: crypto.randomUUID() });
          }));
          offers.append(row);
        }
      } catch (error) { el('alias-message').textContent = error.message; }
    });
    controls.append(viewOffers); card.append(controls, offers); list.append(card);
  }
  const outgoing = el('alias-offers'); outgoing.replaceChildren();
  if (!state.offers.length) outgoing.append(node('p', 'No outgoing offers.'));
  for (const offer of state.offers) {
    const row = node('p', `@${offer.name} · ${formatBalance(offer.amount_cents || 0)} held `);
    if (offer.id) row.append(button('Withdraw offer', () => globalApi(offer.name, `offers/${offer.id}`, 'DELETE')));
    outgoing.append(row);
  }
}

async function warning() {
  const cid = el('alias-cid').value;
  if (!cid) return;
  try {
    const response = await authenticatedFetch(`/api/content/${encodeURIComponent(cid)}`);
    if (cid !== el('alias-cid').value) return;
    if (!response.ok) el('alias-warning').textContent = 'This CID is not stored on HashBin. Inline CIDs and content from other suppliers can still be used.';
    else {
      const metadata = await response.json();
      const end = new Date(Math.max(Date.now(), Date.parse(editing?.alias.paid_through) || 0));
      end.setUTCMonth(end.getUTCMonth() + Number(el('alias-months').value));
      el('alias-warning').textContent = metadata.expires_at && Date.parse(metadata.expires_at) < end.getTime()
        ? 'This content expires before the alias. Renewing the alias does not extend the content.' : '';
    }
  } catch { el('alias-warning').textContent = 'Content availability could not be checked. An alias does not extend content retention.'; }
}

async function action(callback) {
  try {
    el('alias-message').textContent = '';
    const message = await callback();
    await load();
    el('alias-message').textContent = typeof message === 'string' ? message : 'Saved. Resolution changes can take up to a minute.';
  } catch (error) { el('alias-message').textContent = error.message; }
}

async function load() {
  state = await api('');
  el('alias-usage').textContent = `${state.personal.length} of ${state.max_aliases} personal aliases · ${state.changes_left} changes left today (resets at midnight UTC).`;
  const list = el('alias-list');
  list.replaceChildren();
  if (!state.personal.length) list.append(node('p', 'No personal aliases yet.'));
  for (const alias of state.personal) {
    const card = node('article', undefined, 'card');
    card.append(node('h3', `@${alias.name}`));
    const link = node('a', alias.cid, 'alias-cid');
    link.href = `/info.html?cid=${encodeURIComponent(alias.cid)}`;
    card.append(link);
    const expired = Date.parse(alias.paid_through) <= Date.now();
    card.append(node('p', `${expired ? 'Expired' : 'Paid through'}: ${new Date(alias.paid_through).toLocaleString()}`));
    if (expired) card.append(node('p', 'Renew within 30 days of expiry to restore this alias.'));
    const controls = node('div', undefined, 'alias-actions');
    for (const [label, callback] of [
      ['Change CID', () => edit(alias, 'value')],
      ['Renew', () => edit(alias, 'renew')],
      [alias.auto_renew ? 'Disable auto-renew' : 'Enable auto-renew', () => action(async () => {
        if (!alias.auto_renew && !confirm(`Automatically prepay ${alias.renewal_months} months from balance 7 days before expiry?`)) return;
        await api(`/personal/${alias.name}`, 'PATCH', { auto_renew: !alias.auto_renew });
      })],
      ['Delete', () => action(async () => {
        if (!confirm(`Delete @${alias.name}? Prepaid months are not refunded.`)) return;
        await api(`/personal/${alias.name}`, 'DELETE');
      })]
    ]) {
      const button = node('button', label, 'btn btn-secondary');
      button.type = 'button';
      button.disabled = expired && label === 'Change CID';
      button.addEventListener('click', callback);
      controls.append(button);
    }
    card.append(controls); list.append(card);
  }
  price();
  renderGlobal();
}

async function init() {
  if (!await requireAuth()) return;
  el('global-prefill').value = new URLSearchParams(location.search).get('cid') || '';
  edit(null);
  el('alias-months').addEventListener('input', () => { price(); pendingPurchase = null; });
  el('alias-cid').addEventListener('change', warning);
  el('alias-cancel').addEventListener('click', () => edit(null));
  el('alias-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = el('alias-submit'); button.disabled = true;
    await action(async () => {
      const data = { name: el('alias-name').value, cid: el('alias-cid').value, months: Number(el('alias-months').value) };
      if (editing?.mode === 'value') await api(`/personal/${editing.alias.name}`, 'PUT', { cid: data.cid });
      else {
        const fingerprint = JSON.stringify([editing?.alias.name, data]);
        if (pendingPurchase?.fingerprint !== fingerprint) pendingPurchase = { fingerprint, id: crypto.randomUUID() };
        await api(editing ? `/personal/${editing.alias.name}/renew` : '/personal', 'POST', { ...data, request_id: pendingPurchase.id });
      }
      edit(null);
    });
    button.disabled = false;
  });
  await load();
  if (el('alias-cid').value) await warning();
}

init().catch(error => { el('alias-message').textContent = error.message; });
