/**
 * Webhook Handlers
 * Handles incoming webhooks from external services (Clerk, Stripe, etc.)
 */

import { verifyWebhook } from '@clerk/backend/webhooks';

/**
 * Extract OAuth providers from Clerk external_accounts
 */
function extractProviders(externalAccounts) {
  const providers = [];
  
  if (externalAccounts && Array.isArray(externalAccounts)) {
    for (const account of externalAccounts) {
      // Use provider_user_id if available, otherwise use the account id
      // Note: Some providers may only provide 'id' field
      const providerUserId = account.provider_user_id || account.id;
      
      if (!providerUserId) {
        console.warn('Skipping external account with no user ID:', account.provider);
        continue;
      }
      
      providers.push({
        provider: account.provider, // e.g., 'google', 'github', 'oauth_apple'
        provider_user_id: providerUserId,
        linked_at: new Date(account.created_at).toISOString()
      });
    }
  }
  
  return providers;
}

/**
 * Handle Clerk user.created webhook
 * Creates a new UserProfile when a user signs up
 */
async function handleUserCreated(event, env) {
  const userId = event.data.id;
  
  // Extract linked OAuth providers from the event
  const providers = extractProviders(event.data.external_accounts);

  // Create user profile in UserProfile DO
  const userProfileId = env.USER_PROFILES.idFromName(userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request('http://internal/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        providers: providers
      })
    })
  );

  if (!response.ok) {
    // If profile already exists (409), that's okay - might be duplicate webhook
    if (response.status === 409) {
      return {
        success: true,
        message: 'User profile already exists'
      };
    }
    
    const error = await response.json();
    throw new Error(`Failed to create user profile: ${error.message}`);
  }

  return {
    success: true,
    message: 'User profile created successfully'
  };
}

/**
 * Handle Clerk user.updated webhook
 * Updates user profile when OAuth providers are linked/unlinked
 */
async function handleUserUpdated(event, env) {
  const userId = event.data.id;

  // Extract current linked OAuth providers
  const providers = extractProviders(event.data.external_accounts);

  // Update user profile in UserProfile DO
  const userProfileId = env.USER_PROFILES.idFromName(userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request('http://internal/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providers: providers
      })
    })
  );

  if (!response.ok) {
    // If profile doesn't exist (404), create it
    if (response.status === 404) {
      return await handleUserCreated(event, env);
    }
    
    const error = await response.json();
    throw new Error(`Failed to update user profile: ${error.message}`);
  }

  return {
    success: true,
    message: 'User profile updated successfully'
  };
}

/**
 * Handle Clerk user.deleted webhook
 * Marks user profile as deleted (soft delete)
 */
async function handleUserDeleted(event, env) {
  const userId = event.data.id;

  // Soft delete user profile in UserProfile DO
  const userProfileId = env.USER_PROFILES.idFromName(userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request('http://internal/profile', {
      method: 'DELETE'
    })
  );

  if (!response.ok) {
    // If profile doesn't exist (404), that's okay
    if (response.status === 404) {
      return {
        success: true,
        message: 'User profile already deleted or does not exist'
      };
    }
    
    const error = await response.json();
    throw new Error(`Failed to delete user profile: ${error.message}`);
  }

  return {
    success: true,
    message: 'User profile deleted successfully'
  };
}

/**
 * Main Clerk webhook handler
 * POST /api/webhooks/clerk
 */
export async function handleClerkWebhook(request, env) {
  // Verify webhook secret is configured
  if (!env.CLERK_WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return new Response(
      JSON.stringify({
        error: 'Webhook secret not configured'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    // Verify webhook signature using Clerk's verifyWebhook utility
    // This handles both signature verification and parsing
    let event;
    try {
      event = await verifyWebhook(request, {
        signingSecret: env.CLERK_WEBHOOK_SECRET
      });
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      return new Response(
        JSON.stringify({
          error: 'Invalid webhook signature'
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Log webhook event for debugging
    if (env.LOG_LEVEL === 'debug') {
      console.log('Clerk webhook event:', event.type, 'for user:', event.data?.id);
    }

    // Handle different event types
    let result;
    switch (event.type) {
      case 'user.created':
        result = await handleUserCreated(event, env);
        break;
      
      case 'user.updated':
        result = await handleUserUpdated(event, env);
        break;
      
      case 'user.deleted':
        result = await handleUserDeleted(event, env);
        break;
      
      default:
        // Unknown event type - acknowledge but don't process
        if (env.LOG_LEVEL === 'debug') {
          console.log('Unhandled webhook event type:', event.type);
        }
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Event acknowledged but not processed'
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Webhook processing error:', error.message);
    
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
