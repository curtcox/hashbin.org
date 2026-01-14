/**
 * Payments API Handlers
 * Endpoints for Stripe payments, deposits, and donations
 */

import Stripe from 'stripe';
import { authenticate } from '../auth/middleware.js';
import { calculateStripeFees, formatCents, calculateRetentionCost } from '../utils/pricing.js';

/**
 * POST /api/balance/deposit
 * Create a Stripe checkout session for depositing funds
 */
export async function handleCreateDeposit(request, env) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const data = await request.json();
    const amount_cents = data.amount_cents;

    // Validate amount
    if (!amount_cents || amount_cents < 100) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount',
          message: 'Minimum deposit is $1.00 (100 cents)'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Calculate fees
    const fees = calculateStripeFees(amount_cents);

    // Initialize Stripe
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    // Determine URLs based on environment
    const baseUrl = env.ENVIRONMENT === 'production' 
      ? 'https://hashbin.org' 
      : 'https://hashbin-worker-dev.curtcox.workers.dev';

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'HashBin.org Account Deposit',
              description: `Deposit ${formatCents(amount_cents)} to your HashBin account`
            },
            unit_amount: amount_cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${baseUrl}/balance?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/balance?deposit=cancel`,
      client_reference_id: authResult.userId,
      metadata: {
        user_id: authResult.userId,
        type: 'deposit',
        amount_cents: amount_cents.toString()
      },
      automatic_tax: {
        enabled: true
      }
    });

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
        amount_breakdown: {
          gross_cents: fees.grossCents,
          stripe_fee_cents: fees.feeCents,
          net_cents: fees.netCents
        }
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(request, env) {
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    // Get the signature from headers
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({
          error: 'Missing signature'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Get raw body
    const body = await request.text();

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'Invalid signature',
          message: err.message
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object, env);
        break;
      
      case 'checkout.session.expired':
        // Log for debugging - no action needed
        console.log('Checkout session expired:', event.data.object.id);
        break;
      
      case 'charge.dispute.created':
        // Log dispute for admin review
        console.error('Dispute created:', event.data.object);
        // TODO: Notify admin
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({
        error: 'Webhook processing failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Handle successful checkout session
 */
async function handleCheckoutSessionCompleted(session, env) {
  const userId = session.client_reference_id || session.metadata.user_id;
  const type = session.metadata.type;
  const amount_cents = parseInt(session.metadata.amount_cents);

  if (!userId) {
    console.error('No user_id in checkout session:', session.id);
    return;
  }

  if (type === 'deposit') {
    // Credit user balance
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);

    // Get current balance before deposit
    const balanceResponse = await userProfileStub.fetch(
      new Request('http://internal/balance')
    );
    const balanceData = await balanceResponse.json();
    const balance_before = balanceData.balance_cents;

    // Deposit to balance
    const depositResponse = await userProfileStub.fetch(
      new Request('http://internal/balance/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents })
      })
    );

    if (depositResponse.ok) {
      const depositData = await depositResponse.json();
      
      // Record transaction
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
            balance_after_cents: depositData.balance_after_cents,
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent
          })
        })
      );

      console.log(`Deposit completed: ${amount_cents} cents for user ${userId}`);
      // TODO: Send receipt email
    }
  } else if (type === 'donation') {
    // Handle CID donation
    const cid = session.metadata.cid;
    // TODO: Implement donation handling in Phase 4.4
    console.log(`Donation completed: ${amount_cents} cents for CID ${cid}`);
  }
}

/**
 * POST /api/payments/calculate
 * Calculate retention cost for given size and duration
 */
export async function handleCalculateRetention(request, env) {
  try {
    const data = await request.json();
    const size_bytes = data.size_bytes;
    const retention_months = data.retention_months;

    if (!size_bytes || size_bytes < 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid size',
          message: 'Size must be a positive number'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (!retention_months || retention_months < 1) {
      return new Response(
        JSON.stringify({
          error: 'Invalid retention',
          message: 'Minimum retention is 1 month (30 days)'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const cost_cents = calculateRetentionCost(size_bytes, retention_months);

    return new Response(
      JSON.stringify({
        size_bytes: size_bytes,
        retention_months: retention_months,
        cost_cents: cost_cents,
        cost_formatted: formatCents(cost_cents)
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Calculation failed',
        message: error.message
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
