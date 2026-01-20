/**
 * Transaction History Module
 * Handles transaction history display and formatting
 */

import { authenticatedFetch, formatBalance, handleApiError } from './utils.js';

/**
 * Format transaction amount with direction indicator and color
 * @param {number} amountCents Amount in cents
 * @param {string} type Transaction type
 * @returns {Object} { formatted: string, cssClass: string }
 */
export function formatTransactionAmount(amountCents, type) {
  const dollars = Math.abs(amountCents) / 100;
  const formatted = `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  // Deposits are positive (IN), purchases are negative (OUT)
  if (type === 'deposit') {
    return {
      formatted: `${formatted} IN`,
      cssClass: 'amount-in'
    };
  } else {
    return {
      formatted: `${formatted} OUT`,
      cssClass: 'amount-out'
    };
  }
}

/**
 * Format date to absolute UTC format
 * @param {string} isoDate ISO 8601 date string
 * @returns {string} Formatted date "YYYY-MM-DD HH:MM:SS UTC"
 */
export function formatDate(isoDate) {
  const date = new Date(isoDate);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Format MTBR to human-readable format
 * @param {number} mtbrMs Minimum time between requests in milliseconds
 * @returns {string} Formatted string like "100ms (10 req/s)"
 */
export function formatMTBR(mtbrMs) {
  if (!mtbrMs) return 'N/A';
  
  // Calculate requests per second or per minute
  const requestsPerSecond = 1000 / mtbrMs;
  const requestsPerMinute = 60000 / mtbrMs;
  
  let humanReadable;
  if (requestsPerSecond >= 1) {
    humanReadable = `${requestsPerSecond.toFixed(requestsPerSecond >= 10 ? 0 : 1)} req/s`;
  } else {
    humanReadable = `${requestsPerMinute.toFixed(requestsPerMinute >= 10 ? 0 : 1)} req/min`;
  }
  
  return `${mtbrMs}ms (${humanReadable})`;
}

/**
 * Format duration as date range
 * @param {string} startDate ISO 8601 start date
 * @param {number} durationSeconds Duration in seconds
 * @returns {string} Formatted date range
 */
export function formatDateRange(startDate, durationSeconds) {
  if (!startDate || !durationSeconds) return 'N/A';
  
  const start = new Date(startDate);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  
  return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes Bytes
 * @returns {string} Formatted size (e.g., "1 GB", "512 MB")
 */
export function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * Format retention months display
 * @param {number} months Number of months
 * @returns {string} Formatted retention period
 */
export function formatRetentionMonths(months) {
  if (!months) return '-';
  
  if (months === 1) {
    return '1 month';
  } else if (months === 12) {
    return '1 year';
  } else if (months > 12 && months % 12 === 0) {
    return `${months / 12} years`;
  } else if (months > 12) {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return `${years} year${years > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
  }
  
  return `${months} months`;
}

/**
 * Get transaction type label
 * @param {string} type Transaction type
 * @returns {string} Human-readable label
 */
export function getTransactionTypeLabel(type) {
  const labels = {
    'deposit': 'Deposit',
    'upload_payment': 'Content Upload',
    'cid_extension': 'Retention Extension',
    'donation_received': 'Donation to Content',
    'rate_limit_purchase': 'Bandwidth Purchase'
  };
  
  return labels[type] || type;
}

/**
 * Build transaction details HTML based on type
 * @param {Object} transaction Transaction object
 * @returns {string} HTML string for details column
 */
export function buildTransactionDetails(transaction) {
  const details = [];
  
  // CID link (if present)
  if (transaction.cid) {
    details.push(`<div><strong>CID:</strong> <a href="/content/${transaction.cid}" class="cid-link">${transaction.cid}</a></div>`);
  }
  
  // Type-specific details
  if (transaction.type === 'upload_payment' || transaction.type === 'cid_extension' || transaction.type === 'donation_received') {
    if (transaction.retention_months) {
      details.push(`<div><strong>Retention:</strong> ${formatRetentionMonths(transaction.retention_months)}</div>`);
    }
  }
  
  if (transaction.type === 'rate_limit_purchase') {
    if (transaction.min_time_between_requests_ms) {
      details.push(`<div><strong>MTBR:</strong> ${formatMTBR(transaction.min_time_between_requests_ms)}</div>`);
    }
    if (transaction.duration_seconds) {
      details.push(`<div><strong>Duration:</strong> ${formatDateRange(transaction.created_at, transaction.duration_seconds)}</div>`);
    }
    if (transaction.max_requests) {
      details.push(`<div><strong>Max Requests:</strong> ${transaction.max_requests.toLocaleString()}</div>`);
    }
    if (transaction.max_bytes) {
      details.push(`<div><strong>Max Bandwidth:</strong> ${formatBytes(transaction.max_bytes)}</div>`);
    }
  }
  
  // Stripe reference (if present)
  if (transaction.type === 'deposit' && transaction.stripe_session_id) {
    details.push(`<div><strong>Stripe:</strong> <span style="font-family: monospace; font-size: 0.875rem;">${transaction.stripe_session_id.slice(0, 20)}...</span></div>`);
  }
  
  // Failed transaction details
  if (transaction.status === 'failed' && transaction.failure_reason) {
    details.push(`<div class="failure-reason"><strong>Reason:</strong> ${transaction.failure_reason}</div>`);
  }
  
  return details.length > 0 ? details.join('') : '-';
}

/**
 * Fetch transaction history from API
 * @param {Object} options Options (limit, offset, type)
 * @returns {Promise<Object>} Transaction data
 */
export async function fetchTransactions(options = {}) {
  const { limit = 20, offset = 0, type = null } = options;
  
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (type) {
    params.set('type', type);
  }
  
  const response = await authenticatedFetch(`/api/balance/history?${params.toString()}`);
  await handleApiError(response);
  
  return await response.json();
}

/**
 * Render transaction list
 * @param {Array} transactions Array of transactions
 * @param {HTMLElement} container Container element
 */
export function renderTransactionList(transactions, container) {
  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No transactions yet.</p>
        <p style="margin-top: 0.5rem;">Your transaction history will appear here.</p>
      </div>
    `;
    return;
  }
  
  const rows = transactions.map(tx => {
    const amount = formatTransactionAmount(tx.amount_cents, tx.type);
    const date = formatDate(tx.created_at);
    const typeLabel = getTransactionTypeLabel(tx.type);
    const details = buildTransactionDetails(tx);
    const balance = formatBalance(tx.balance_after_cents);
    const statusBadge = tx.status === 'failed' ? '<span class="status-badge status-failed">FAILED</span>' : '';
    const rowClass = tx.status === 'failed' ? 'transaction-failed' : '';
    
    return `
      <tr class="${rowClass}">
        <td class="date-cell">${date}</td>
        <td>${typeLabel} ${statusBadge}</td>
        <td class="amount-cell"><span class="${amount.cssClass}">${amount.formatted}</span></td>
        <td class="details-cell">${details}</td>
        <td class="balance-cell">${balance}</td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <table class="transaction-table">
      <thead>
        <tr>
          <th>Date/Time</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Details</th>
          <th>Balance After</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Render pagination controls
 * @param {number} total Total number of transactions
 * @param {number} limit Results per page
 * @param {number} offset Current offset
 * @param {Function} onPageChange Callback when page changes
 * @param {HTMLElement} container Container element
 */
export function renderPagination(total, limit, offset, onPageChange, container) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  
  container.innerHTML = `
    <div class="pagination">
      <button 
        class="btn btn-secondary" 
        ${!hasPrev ? 'disabled' : ''} 
        data-page="${currentPage - 1}"
      >
        Previous
      </button>
      <span class="pagination-info">
        Page ${currentPage} of ${totalPages} (${total} total)
      </span>
      <button 
        class="btn btn-secondary" 
        ${!hasNext ? 'disabled' : ''} 
        data-page="${currentPage + 1}"
      >
        Next
      </button>
    </div>
  `;
  
  // Attach event listeners
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      const newOffset = (page - 1) * limit;
      onPageChange(newOffset);
    });
  });
}
