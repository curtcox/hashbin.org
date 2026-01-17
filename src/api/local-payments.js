/**
 * Local Payments API Handlers
 * Mock payment flow for local development (no Stripe).
 */

import { authenticate } from '../auth/middleware.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function handleLocalDepositUnavailable() {
  return jsonResponse(
    {
      error: 'Stripe disabled in local mode',
      message: 'Use /api/balance/dev-deposit to add funds while running locally.'
    },
    400
  );
}

export async function handleLocalDonationUnavailable() {
  return jsonResponse(
    {
      error: 'Stripe disabled in local mode',
      message: 'Donations are disabled in local mode.'
    },
    400
  );
}

export async function handleLocalDevDeposit(request, env) {
  if (env.ENVIRONMENT !== 'local') {
    return jsonResponse(
      {
        error: 'Endpoint unavailable',
        message: 'Dev deposits are only available in local mode.'
      },
      404
    );
  }

  const authResult = await authenticate(request, env);

  if (!authResult.authenticated) {
    return jsonResponse(
      {
        error: 'Unauthorized',
        message: 'Authentication required'
      },
      401
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse(
      {
        error: 'Invalid request',
        message: 'Request body must be valid JSON'
      },
      400
    );
  }

  const amount_cents = body.amount_cents;

  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return jsonResponse(
      {
        error: 'Invalid amount',
        message: 'Amount must be a positive integer of cents'
      },
      400
    );
  }

  const userId = authResult.user.userId;
  const userProfileId = env.USER_PROFILES.idFromName(userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const balanceResponse = await userProfileStub.fetch(
    new Request('http://internal/balance')
  );

  if (!balanceResponse.ok) {
    return jsonResponse(
      {
        error: 'Profile not found',
        message: 'User profile is missing'
      },
      404
    );
  }

  const balanceData = await balanceResponse.json();
  const balance_before = balanceData.balance_cents;

  const depositResponse = await userProfileStub.fetch(
    new Request('http://internal/balance/deposit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_cents })
    })
  );

  if (!depositResponse.ok) {
    const error = await depositResponse.json();
    return jsonResponse(error, depositResponse.status);
  }

  const depositData = await depositResponse.json();

  const transactionId = crypto.randomUUID();
  const paymentRecordId = env.PAYMENT_RECORDS.idFromName(userId);
  const paymentRecordStub = env.PAYMENT_RECORDS.get(paymentRecordId);

  await paymentRecordStub.fetch(
    new Request('http://internal/transaction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        transaction_id: transactionId,
        type: 'deposit',
        user_id: userId,
        amount_cents: amount_cents,
        balance_before_cents: balance_before,
        balance_after_cents: depositData.balance_after_cents
      })
    })
  );

  return jsonResponse({
    transaction_id: transactionId,
    amount_cents: amount_cents,
    balance_before_cents: balance_before,
    balance_after_cents: depositData.balance_after_cents
  });
}
