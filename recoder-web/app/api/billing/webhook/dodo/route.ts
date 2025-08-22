/**
 * DODO Pay Webhook Handler
 * Processes subscription events and syncs with CLI session management
 * Handles real-time billing updates across all platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { dodoPayments } from '@/lib/dodo-payments';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const signature = headersList.get('x-dodo-signature') || headersList.get('dodo-signature');
    
    if (!signature) {
      console.error('Missing webhook signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    
    // Verify webhook signature
    const isValidSignature = dodoPayments.verifyWebhookSignature(rawBody, signature);
    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 403 }
      );
    }

    const event = JSON.parse(rawBody);
    console.log('Received DODO Pay webhook:', event.event, event.data?.subscription_id);

    // Process the webhook event
    await dodoPayments.processWebhookEvent(event);

    // Additional processing for CLI integration
    await handleCLIIntegration(event);

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Webhook processing failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Webhook processing failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Handle CLI-specific integration for billing events
 */
async function handleCLIIntegration(event: any) {
  try {
    const { customer_id: userId, subscription_id, plan_id, status } = event.data;

    // Map DODO plan to internal plan
    const planMapping = {
      'plan_pro_20_monthly': 'pro',
      'plan_team_50_monthly': 'team',
      'plan_enterprise_200_monthly': 'enterprise'
    };
    
    const internalPlan = planMapping[plan_id as keyof typeof planMapping] || 'free';

    switch (event.event) {
      case 'subscription.created':
      case 'subscription.updated':
        // Update CLI session with new subscription data
        await updateCLISession(userId, {
          plan: internalPlan,
          status: status,
          subscription_id: subscription_id,
          updated_at: new Date().toISOString()
        });

        // Reset quota for new subscription
        if (event.event === 'subscription.created') {
          await resetUserQuota(userId, internalPlan);
        }
        break;

      case 'subscription.cancelled':
        // Downgrade to free plan
        await updateCLISession(userId, {
          plan: 'free',
          status: 'cancelled',
          subscription_id: subscription_id,
          updated_at: new Date().toISOString()
        });

        // Set quota to free tier
        await resetUserQuota(userId, 'free');
        break;

      case 'payment.succeeded':
        // Reset monthly quota
        await resetUserQuota(userId, internalPlan);
        
        // Notify CLI users that quota has been reset
        await notifyCLIUsers(userId, 'quota_reset', {
          plan: internalPlan,
          reset_date: new Date().toISOString()
        });
        break;

      case 'payment.failed':
        // Notify CLI users of payment failure
        await notifyCLIUsers(userId, 'payment_failed', {
          subscription_id: subscription_id,
          action_required: true
        });
        break;
    }

  } catch (error) {
    console.error('Failed to handle CLI integration:', error);
    // Don't fail webhook processing if CLI integration fails
  }
}

/**
 * Update CLI session with new billing data
 */
async function updateCLISession(userId: string, billingData: any) {
  try {
    // Call session sync API to update unified sessions
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/billing-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`
      },
      body: JSON.stringify({
        user_id: userId,
        billing_data: billingData,
        source: 'dodo_webhook',
        timestamp: Date.now()
      })
    });

    console.log(`Updated CLI session for user ${userId}`);
  } catch (error) {
    console.error('Failed to update CLI session:', error);
  }
}

/**
 * Reset user quota based on plan
 */
async function resetUserQuota(userId: string, plan: string) {
  try {
    const quotaLimits = {
      free: 500,
      pro: 5000,
      team: 15000,
      enterprise: -1 // unlimited
    };

    const newQuota = quotaLimits[plan as keyof typeof quotaLimits] || 500;

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/quota/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`
      },
      body: JSON.stringify({
        user_id: userId,
        new_limit: newQuota,
        used: 0,
        reset_date: new Date().toISOString()
      })
    });

    console.log(`Reset quota for user ${userId} to ${newQuota} requests`);
  } catch (error) {
    console.error('Failed to reset user quota:', error);
  }
}

/**
 * Notify CLI users about billing changes
 */
async function notifyCLIUsers(userId: string, eventType: string, data: any) {
  try {
    // Send WebSocket notification to active CLI sessions
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`
      },
      body: JSON.stringify({
        user_id: userId,
        event_type: eventType,
        data: data,
        platforms: ['cli', 'router'], // Notify CLI and router
        timestamp: Date.now()
      })
    });

    console.log(`Notified CLI users for user ${userId}: ${eventType}`);
  } catch (error) {
    console.error('Failed to notify CLI users:', error);
  }
}