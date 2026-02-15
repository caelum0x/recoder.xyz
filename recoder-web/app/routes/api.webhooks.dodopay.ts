/**
 * DodoPay Webhook Handler
 * Processes subscription events from DodoPay
 */

import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { getDodoPayClient } from '~/lib/.server/payment/dodopay';
import { getDatabase } from '~/lib/.server/db/client';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.webhooks.dodopay');

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
  
  try {
    // Get raw body and signature
    const body = await request.text();
    const signature = request.headers.get('x-dodopay-signature') || '';

    // Verify webhook signature
    const dodopay = getDodoPayClient(env);
    const isValid = dodopay.verifyWebhook(body, signature);

    if (!isValid) {
      logger.warn('Invalid DodoPay webhook signature');
      return json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse webhook data
    const event = JSON.parse(body);
    const eventType = event.type;
    const eventId = event.id;

    logger.info(`Processing DodoPay webhook: ${eventType} (${eventId})`);

    // Store webhook event
    const db = getDatabase(env);
    await db.storeWebhookEvent('dodopay', eventType, eventId, event);

    // Process event
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
    logger.error('DodoPay webhook processing failed:', error);
    return json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function processWebhookEvent(env: Env, event: any) {
  const db = getDatabase(env);
  const eventType = event.type;

  switch (eventType) {
    case 'subscription.created':
      await handleSubscriptionCreated(db, event);
      break;

    case 'subscription.updated':
      await handleSubscriptionUpdated(db, event);
      break;

    case 'subscription.cancelled':
      await handleSubscriptionCancelled(db, event);
      break;

    case 'payment.succeeded':
      await handlePaymentSucceeded(db, event);
      break;

    case 'payment.failed':
      await handlePaymentFailed(db, event);
      break;

    case 'subscription.expired':
      await handleSubscriptionExpired(db, event);
      break;

    default:
      logger.info(`Unhandled DodoPay event type: ${eventType}`);
  }
}

async function handleSubscriptionCreated(db: any, event: any) {
  const subscription = event.data;
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    logger.warn('No user ID in DodoPay subscription data');
    return;
  }

  const planId = subscription.metadata?.plan_id || 'pro';
  const limit = getGenerationLimit(planId);

  await db.execute(`
    INSERT INTO subscriptions (
      user_id, provider, subscription_id, customer_id,
      plan_id, status, amount, currency,
      current_period_start, current_period_end,
      monthly_request_limit, metadata
    ) VALUES (
      $1, 'dodopay', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
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
    subscription.amount,
    subscription.currency,
    subscription.current_period_start,
    subscription.current_period_end,
    limit,
    JSON.stringify(subscription),
  ]);

  logger.info(`DodoPay subscription created for user ${userId}: ${planId}`);
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
    subscription.amount,
    subscription.current_period_start,
    subscription.current_period_end,
    JSON.stringify(subscription),
    subscription.id,
  ]);

  logger.info(`DodoPay subscription updated: ${subscription.id}`);
}

async function handleSubscriptionCancelled(db: any, event: any) {
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

  logger.info(`DodoPay subscription cancelled: ${subscription.id}`);
}

async function handlePaymentSucceeded(db: any, event: any) {
  const payment = event.data;
  const subscriptionId = payment.subscription_id;

  const subscription = await db.execute(`
    SELECT user_id FROM subscriptions WHERE subscription_id = $1
  `, [subscriptionId]);

  if (!subscription || subscription.length === 0) {
    logger.warn('No subscription found for DodoPay payment');
    return;
  }

  const userId = subscription[0].user_id;

  await db.execute(`
    INSERT INTO payment_transactions (
      user_id, subscription_id, provider, transaction_id,
      amount, currency, status, payment_method, metadata
    )
    SELECT
      $1,
      id,
      'dodopay',
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
    payment.id,
    payment.amount,
    payment.currency,
    payment.payment_method || 'alipay',
    JSON.stringify(payment),
    subscriptionId,
  ]);

  logger.info(`DodoPay payment succeeded: ${payment.id}`);
}

async function handlePaymentFailed(db: any, event: any) {
  const payment = event.data;

  logger.warn({
    paymentId: payment.id,
    customerId: payment.customer_id,
    amount: payment.amount,
    currency: payment.currency,
    failureReason: payment.failure_reason || payment.error_code,
  }, 'DodoPay payment failed');

  // Look up user for monitoring/alerting
  try {
    const result = await db.execute(`
      SELECT u.email, u.id FROM users u
      JOIN subscriptions s ON s.user_id = u.id
      WHERE s.customer_id = $1
      LIMIT 1
    `, [payment.customer_id]);

    if (result.rows?.[0]) {
      logger.warn({
        userId: result.rows[0].id,
        userEmail: result.rows[0].email,
        paymentId: payment.id,
      }, 'DodoPay payment failed for user - requires follow-up');
    }
  } catch {
    // User lookup is best-effort for monitoring
  }
}

async function handleSubscriptionExpired(db: any, event: any) {
  const subscription = event.data;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'expired',
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscription.id]);

  logger.info(`DodoPay subscription expired: ${subscription.id}`);
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
