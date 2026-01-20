/**
 * Paddle Webhook Handler
 * Processes subscription events from Paddle
 */

import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { getPaddleClient } from '~/lib/.server/payment/paddle';
import { getDatabase } from '~/lib/.server/db/client';

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
  
  try {
    // Get raw body and signature
    const body = await request.text();
    const signature = request.headers.get('paddle-signature') || '';

    // Verify webhook signature
    const paddle = getPaddleClient(env);
    const isValid = paddle.verifyWebhook(body, signature);

    if (!isValid) {
      console.error('Invalid Paddle webhook signature');
      return json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse webhook data
    const event = JSON.parse(body);
    const eventType = event.event_type;
    const eventId = event.event_id;

    console.log(`Processing Paddle webhook: ${eventType} (${eventId})`);

    // Store webhook event
    const db = getDatabase(env);
    await db.storeWebhookEvent('paddle', eventType, eventId, event);

    // Process event based on type
    try {
      await processWebhookEvent(env, event);
      await db.markWebhookProcessed(eventId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await db.markWebhookProcessed(eventId, errorMessage);
      throw error;
    }

    return json({ received: true });
  } catch (error) {
    console.error('Paddle webhook processing failed:', error);
    return json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function processWebhookEvent(env: Env, event: any) {
  const db = getDatabase(env);
  const eventType = event.event_type;

  switch (eventType) {
    case 'subscription.created':
      await handleSubscriptionCreated(db, event);
      break;

    case 'subscription.updated':
      await handleSubscriptionUpdated(db, event);
      break;

    case 'subscription.canceled':
      await handleSubscriptionCanceled(db, event);
      break;

    case 'subscription.paused':
      await handleSubscriptionPaused(db, event);
      break;

    case 'subscription.resumed':
      await handleSubscriptionResumed(db, event);
      break;

    case 'transaction.completed':
      await handleTransactionCompleted(db, event);
      break;

    case 'transaction.failed':
      await handleTransactionFailed(db, event);
      break;

    case 'subscription.past_due':
      await handleSubscriptionPastDue(db, event);
      break;

    default:
      console.log(`Unhandled Paddle event type: ${eventType}`);
  }
}

async function handleSubscriptionCreated(db: any, event: any) {
  const subscription = event.data;
  const userId = subscription.custom_data?.user_id;

  if (!userId) {
    console.error('No user ID in subscription data');
    return;
  }

  // Determine plan ID from price
  const planId = getPlanIdFromPrice(subscription.items[0]?.price?.id);
  const limit = getGenerationLimit(planId);

  await db.execute(`
    INSERT INTO subscriptions (
      user_id, provider, subscription_id, customer_id,
      plan_id, status, amount, currency,
      current_period_start, current_period_end,
      monthly_request_limit, metadata
    ) VALUES (
      $1, 'paddle', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    ON CONFLICT (subscription_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      amount = EXCLUDED.amount,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = NOW()
  `, [
    userId,
    subscription.id,
    subscription.customer_id,
    planId,
    subscription.status,
    subscription.billing_details?.amount?.total,
    subscription.currency_code,
    subscription.current_billing_period?.starts_at,
    subscription.current_billing_period?.ends_at,
    limit,
    JSON.stringify(subscription),
  ]);

  console.log(`Subscription created for user ${userId}: ${planId}`);
}

async function handleSubscriptionUpdated(db: any, event: any) {
  const subscription = event.data;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = $1,
      amount = $2,
      current_period_start = $3,
      current_period_end = $4,
      metadata = $5,
      updated_at = NOW()
    WHERE subscription_id = $6
  `, [
    subscription.status,
    subscription.billing_details?.amount?.total,
    subscription.current_billing_period?.starts_at,
    subscription.current_billing_period?.ends_at,
    JSON.stringify(subscription),
    subscription.id,
  ]);

  console.log(`Subscription updated: ${subscription.id}`);
}

async function handleSubscriptionCanceled(db: any, event: any) {
  const subscription = event.data;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'cancelled',
      cancel_at_period_end = true,
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscription.id]);

  console.log(`Subscription cancelled: ${subscription.id}`);
}

async function handleSubscriptionPaused(db: any, event: any) {
  const subscription = event.data;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'paused',
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscription.id]);

  console.log(`Subscription paused: ${subscription.id}`);
}

async function handleSubscriptionResumed(db: any, event: any) {
  const subscription = event.data;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'active',
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscription.id]);

  console.log(`Subscription resumed: ${subscription.id}`);
}

async function handleTransactionCompleted(db: any, event: any) {
  const transaction = event.data;
  const subscriptionId = transaction.subscription_id;

  // Find user from subscription
  const subscription = await db.execute(`
    SELECT user_id FROM subscriptions WHERE subscription_id = $1
  `, [subscriptionId]);

  if (!subscription || subscription.length === 0) {
    console.error('No subscription found for transaction');
    return;
  }

  const userId = subscription[0].user_id;

  // Record payment transaction
  await db.execute(`
    INSERT INTO payment_transactions (
      user_id, subscription_id, provider, transaction_id,
      amount, currency, status, payment_method, metadata
    )
    SELECT
      $1,
      id,
      'paddle',
      $2,
      $3,
      $4,
      'succeeded',
      $5,
      $6
    FROM subscriptions
    WHERE subscription_id = $7
  `, [
    userId,
    transaction.id,
    transaction.details?.totals?.total,
    transaction.currency_code,
    transaction.payments?.[0]?.method_details?.type || 'card',
    JSON.stringify(transaction),
    subscriptionId,
  ]);

  console.log(`Transaction completed: ${transaction.id}`);
}

async function handleTransactionFailed(db: any, event: any) {
  const transaction = event.data;

  console.error(`Transaction failed: ${transaction.id}`);
  // TODO: Send notification to user about failed payment
}

async function handleSubscriptionPastDue(db: any, event: any) {
  const subscription = event.data;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'past_due',
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscription.id]);

  console.warn(`Subscription past due: ${subscription.id}`);
  // TODO: Send notification to user
}

function getPlanIdFromPrice(priceId: string): string {
  // Map Paddle price IDs to plan IDs
  const priceMap: Record<string, string> = {
    'pri_pro_monthly': 'pro',
    'pri_pro_yearly': 'pro',
    'pri_team_monthly': 'team',
    'pri_team_yearly': 'team',
    'pri_enterprise_monthly': 'enterprise',
    'pri_enterprise_yearly': 'enterprise',
  };

  return priceMap[priceId] || 'pro';
}

function getGenerationLimit(planId: string): number {
  const limits: Record<string, number> = {
    free: 5,
    pro: 100,
    team: 500,
    enterprise: 2000,
  };

  return limits[planId] || 100;
}
