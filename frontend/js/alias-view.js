import { authenticatedFetch, formatBalance, getAppConfig } from './utils.js';
import { initializeAuth, getAuthState } from './auth-loader.js';

const el = id => document.getElementById(id);
let name, info, signedIn = false;
const node = (tag, text) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; };

async function read() {
  const path = `/api/aliases/${encodeURIComponent(name)}`;
  const response = signedIn ? await authenticatedFetch(path) : await fetch(path);
  if (!response.ok) throw new Error((await response.json()).error || 'Lookup failed');
  info = await response.json();
  const panel = el('alias-info'); panel.replaceChildren(); panel.hidden = false;
  panel.append(node('h2', `@${info.name}`), node('p', `Status: ${info.status}`));
  if (info.cid) {
    const link = node('a', info.cid); link.href = `/info.html?cid=${encodeURIComponent(info.cid)}`; panel.append(link);
    const config = await getAppConfig();
    const contentOrigin = /^https?:\/\//.test(config.content_domain) ? config.content_domain : `https://${config.content_domain || '256t.us'}`;
    const download = node('a', 'Open alias'); download.href = `${contentOrigin}/@${info.name}`;
    const p = node('p'); p.append(download); panel.append(p);
  }
  if (info.paid_through) panel.append(node('p', `Paid through: ${new Date(info.paid_through).toLocaleString()}`));
  const report = node('a', 'Report this alias'); report.href = `/disputes/submit.html?target_type=alias&name=${encodeURIComponent(info.name)}`; panel.append(report);
  const history = el('history-list'); history.replaceChildren(); el('alias-history').hidden = false;
  for (const item of info.history.slice().reverse()) history.append(node('li', `${new Date(item.time).toLocaleString()} · ${item.type === 'value' ? 'Value: ' + item.cid : 'Ownership change: ' + formatBalance(item.price_cents)}`));
  renderActions();
}

function form(title, fields, buttonText, callback) {
  const container = node('section'); container.className = 'card'; container.append(node('h2', title));
  const element = node('form'); element.className = 'alias-form';
  const inputs = {};
  for (const [key, label, type, value, min, max] of fields) {
    const input = node('input'); input.type = type; input.value = value ?? ''; input.required = true;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    input.name = key; const wrapper = node('label', label); wrapper.append(input); element.append(wrapper); inputs[key] = input;
  }
  const quote = node('p'); element.append(quote);
  if (inputs.cid) {
    const warning = node('p'); warning.setAttribute('role', 'status'); element.append(warning);
    const check = async () => {
      const cid = inputs.cid.value;
      if (!cid) return;
      try {
        const response = await fetch(`/api/content/${encodeURIComponent(cid)}`);
        if (cid !== inputs.cid.value) return;
        if (!response.ok) warning.textContent = 'This CID is not stored on HashBin. Inline CIDs and other suppliers can still be used.';
        else {
          const metadata = await response.json();
          const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() + Number(inputs.years?.value || 1));
          warning.textContent = metadata.expires_at && Date.parse(metadata.expires_at) < end.getTime()
            ? 'This content expires before the alias. Alias renewal does not extend content retention.' : '';
        }
      } catch { warning.textContent = 'Content availability could not be checked. Aliases do not extend retention.'; }
    };
    inputs.cid.addEventListener('change', check); inputs.years?.addEventListener('change', check);
    check();
  }
  const update = () => { quote.textContent = inputs.years ? `${formatBalance(Number(inputs.years.value) * info.yearly_price_cents)} from balance.` : ''; };
  if (inputs.years) inputs.years.addEventListener('input', update); update();
  const button = node('button', buttonText); button.className = 'btn btn-primary'; element.append(button);
  let pending;
  element.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true;
    try {
      const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.type === 'number' ? Number(input.value) : input.value]));
      const fingerprint = JSON.stringify(values);
      if (pending?.fingerprint !== fingerprint) pending = { fingerprint, id: crypto.randomUUID() };
      await callback({ ...values, request_id: pending.id });
      await read(); el('alias-message').textContent = 'Saved. Resolution changes can take up to a minute.';
    } catch (error) { el('alias-message').textContent = error.message; }
    button.disabled = false;
  });
  container.append(element); return container;
}

async function mutate(action, body) {
  const response = await authenticatedFetch(`/api/aliases/${encodeURIComponent(name)}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data;
}

function renderActions() {
  const actions = el('alias-actions'); actions.replaceChildren();
  if (!signedIn) { const login = node('a', 'Sign in to claim, renew, buy or make an offer.'); login.href = `/?return=${encodeURIComponent(location.pathname + location.search)}`; actions.append(login); return; }
  if (info.status === 'free') actions.append(form('Claim this global name', [
    ['cid', 'Content CID', 'text', new URLSearchParams(location.search).get('cid') || ''], ['years', 'Years to prepay', 'number', 1, 1, 10]
  ], 'Claim alias', values => mutate('claim', values)));
  if (info.is_owner && ['owned', 'expired'].includes(info.status)) actions.append(form('Renew this name', [['years', 'Years to prepay', 'number', 1, 1, 10]], 'Renew', values => mutate('renew', values)));
  if (info.is_owner) {
    const manage = node('a', 'Change CID, renewal settings, listing or incoming offers'); manage.href = '/dashboard/aliases/'; actions.append(manage);
  } else if (info.status === 'owned') {
    if (info.listing_price_cents) actions.append(form(`Buy now for ${formatBalance(info.listing_price_cents)}`, [], 'Buy alias', values => mutate('buy', { ...values, price_cents: info.listing_price_cents })));
    actions.append(form('Make an offer (balance held immediately)', [
      ['amount_cents', 'Offer in cents (minimum 100)', 'number', 100, 100, 100000000], ['expires_in_days', 'Expires in days', 'number', 7, 1, 30]
    ], 'Hold funds and send offer', values => mutate('offers', values)));
  }
  actions.append(node('p', `Sales transfer the current CID and remaining term. Seller fee: ${Math.round(info.sale_fee_rate * 100)}%, minimum ${formatBalance(info.minimum_sale_fee_cents)}. Proceeds stay in non-withdrawable HashBin balance.`));
}

async function init() {
  await initializeAuth(); signedIn = (await getAuthState()).authenticated;
  el('alias-lookup').addEventListener('submit', event => {
    event.preventDefault(); const query = new URLSearchParams({ name: el('lookup-name').value }); location.search = query.toString();
  });
  name = new URLSearchParams(location.search).get('name');
  if (name) { el('lookup-name').value = name; await read(); }
}
init().catch(error => { el('alias-message').textContent = error.message; });
