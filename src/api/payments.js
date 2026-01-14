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
    const donorId = session.metadata.donor_id === 'anonymous' ? null : session.metadata.donor_id;

    // Get content metadata to find size
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const contentResponse = await contentMetadataStub.fetch(
      new Request('http://internal/content')
    );

    if (contentResponse.ok) {
      const content = await contentResponse.json();
      const size_bytes = content.size_bytes;

      // Calculate months to add
      const donationDollars = amount_cents / 100;
      const sizeGB = size_bytes / (1024 * 1024 * 1024);
      const monthsToAdd = donationDollars / (sizeGB * 0.03);

      // Extend retention
      const transactionId = crypto.randomUUID();
      await contentMetadataStub.fetch(
        new Request('http://internal/extend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            months_to_add: monthsToAdd,
            amount_cents: amount_cents,
            payer_id: donorId,
            payment_id: transactionId
          })
        })
      );

      // If donor is authenticated, record transaction
      if (donorId) {
        const paymentRecordId = env.PAYMENT_RECORDS.idFromName(donorId);
        const paymentRecordStub = env.PAYMENT_RECORDS.get(paymentRecordId);

        await paymentRecordStub.fetch(
          new Request('http://internal/transaction', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              transaction_id: transactionId,
              type: 'donation_received',
              user_id: donorId,
              amount_cents: amount_cents,
              balance_before_cents: 0,
              balance_after_cents: 0,
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              cid: cid,
              retention_months: monthsToAdd
            })
          })
        );
      }

      console.log(`Donation completed: ${amount_cents} cents for CID ${cid} by ${donorId || 'anonymous'}`);
      // Note: No email notification for donations per requirements
    } else {
      console.error(`Failed to process donation for CID ${cid}: content not found`);
    }
  }
}

/**
 * POST /api/donate/cid/:cid
 * Create a Stripe checkout session for donating to a CID (anonymous allowed)
 */
export async function handleCreateDonation(request, env, cid) {
  try {
    const data = await request.json();
    const amount_cents = data.amount_cents;

    // Validate amount
    if (!amount_cents || amount_cents < 100) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount',
          message: 'Minimum donation is $1.00 (100 cents)'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check if content exists
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const existsResponse = await contentMetadataStub.fetch(
      new Request('http://internal/exists')
    );
    const existsData = await existsResponse.json();

    if (!existsData.exists) {
      return new Response(
        JSON.stringify({
          error: 'Content not found',
          message: 'The specified CID does not exist'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Calculate how many months this donation provides
    const donationDollars = amount_cents / 100;
    const sizeGB = existsData.size_bytes / (1024 * 1024 * 1024);
    const monthsAdded = donationDollars / (sizeGB * 0.03);

    // Calculate new expiration
    const currentExpiration = new Date(existsData.expires_at);
    const newExpiration = new Date(currentExpiration);
    newExpiration.setMonth(newExpiration.getMonth() + Math.floor(monthsAdded));

    // Initialize Stripe
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    // Determine URLs based on environment
    const baseUrl = env.ENVIRONMENT === 'production' 
      ? 'https://hashbin.org' 
      : 'https://hashbin-worker-dev.curtcox.workers.dev';

    // Get optional donor user ID
    const authResult = await authenticate(request, env);
    const donorId = authResult.authenticated ? authResult.userId : null;

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Extend HashBin Content (${cid.substring(0, 12)}...)`,
              description: `Donate ${formatCents(amount_cents)} to extend retention by ~${Math.floor(monthsAdded)} months`
            },
            unit_amount: amount_cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${baseUrl}/content/${cid}?donation=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/content/${cid}?donation=cancel`,
      client_reference_id: donorId,
      metadata: {
        type: 'donation',
        cid: cid,
        amount_cents: amount_cents.toString(),
        donor_id: donorId || 'anonymous'
      },
      automatic_tax: {
        enabled: true
      }
    });

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
        estimated_months_added: Math.floor(monthsAdded),
        estimated_new_expiration: newExpiration.toISOString(),
        current_expiration: existsData.expires_at,
        amount_cents: amount_cents
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Donation creation failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
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
