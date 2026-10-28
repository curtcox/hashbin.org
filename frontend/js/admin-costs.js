import { adminHeaders } from '/js/admin-auth.js';

const byId = id => document.getElementById(id);
const money = cents => Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : 'Unavailable';

async function load(brake) {
  const status = byId('cost-status');
  try {
    const response = await fetch('/api/admin/cost-safety', {
      method: typeof brake === 'boolean' ? 'POST' : 'GET',
      headers: { ...await adminHeaders(), 'Content-Type': 'application/json' },
      ...(typeof brake === 'boolean' ? { body: JSON.stringify({ brake }) } : {})
    });
    if (!response.ok) throw new Error(`Request failed (HTTP ${response.status})`);
    if (typeof brake === 'boolean') return load();
    const report = await response.json();
    byId('cost-report').hidden = false;
    status.textContent = report.stale ? 'Cost data is missing or more than two hours old. Check the cost monitor alerts.'
      : report.revenue_error ? 'Costs are reporting; revenue is unavailable. Projection and brake checks remain active.'
      : report.top_files_error ? 'Costs are reporting; download analytics are unavailable. Check the alerts.' : 'Hourly monitor is reporting.';
    byId('cost-mtd').textContent = money(report.costs_cents);
    byId('cost-revenue').textContent = money(report.revenue_kept_cents);
    byId('cost-projected').textContent = money(report.projected_cents);
    byId('cost-updated').textContent = report.recorded_at || 'No snapshot yet';
    byId('cost-brake').textContent = report.hard_stop ? 'Hard stop: all downloads return 503' : report.manual_brake || report.brake ? 'Anonymous: file allowance only; funded downloads enabled' : 'File allowances and funded downloads enabled';
    byId('brake-disable').disabled = Boolean(report.manual_brake);
    byId('cost-files').replaceChildren(...(report.top_files || []).map(file => {
      const row = document.createElement('tr');
      for (const value of [file.cid, file.downloads, file.status, file.payer || 'unknown']) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
  } catch (error) { status.textContent = error.message; }
}

byId('cost-form').addEventListener('submit', event => { event.preventDefault(); load(); });
byId('brake-enable').addEventListener('click', () => load(true));
byId('brake-disable').addEventListener('click', () => load(false));
load();
