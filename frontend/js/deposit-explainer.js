/**
 * /docs/deposits.html: example table and calculator, from the same math as the deposit page
 */

import { STRIPE_FIXED_CENTS, STRIPE_RATE, depositBreakdown, formatCents } from './deposit-math.js';

const EXAMPLE_CREDITS = [100, 500, 1000, 2000, 5000, 10000];

function renderExamples() {
  const body = document.getElementById('example-rows');
  for (const credit of EXAMPLE_CREDITS) {
    const b = depositBreakdown(credit);
    const row = document.createElement('tr');
    for (const text of [formatCents(b.creditCents), formatCents(b.cardCostCents), formatCents(b.totalChargeCents),
      `${(100 * b.cardCostCents / b.creditCents).toFixed(1)}%`]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
}

function line(label, value) {
  const div = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  div.append(strong, value);
  return div;
}

function renderCalculator() {
  const output = document.getElementById('calc-output');
  const dollars = Number(document.getElementById('calc-amount').value);
  const credit = Math.round(dollars * 100);
  if (!Number.isFinite(dollars) || credit < 100) {
    output.replaceChildren(line('Enter an amount', 'the minimum deposit is $1.00.'));
    return;
  }
  const b = depositBreakdown(credit);
  const exact = (credit + STRIPE_FIXED_CENTS) / (1 - STRIPE_RATE) / 100;
  const stripeExact = (b.totalChargeCents * STRIPE_RATE + STRIPE_FIXED_CENTS) / 100;
  output.replaceChildren(
    line('Total before rounding', `(${formatCents(credit)} + $0.30) ÷ 0.971 = $${exact.toFixed(4)}`),
    line('You pay (rounded up to the cent)', formatCents(b.totalChargeCents)),
    line('Card payment cost', `${formatCents(b.totalChargeCents)} − ${formatCents(credit)} = ${formatCents(b.cardCostCents)}`),
    line("Stripe's fee", `2.9% × ${formatCents(b.totalChargeCents)} + $0.30 = $${stripeExact.toFixed(4)}, about ${formatCents(b.stripeFeeCents)}`),
    line('HashBin keeps from rounding', formatCents(b.roundingCents)),
    line('Added to your balance', formatCents(credit))
  );
}

renderExamples();
document.getElementById('calc-amount').addEventListener('input', renderCalculator);
renderCalculator();
