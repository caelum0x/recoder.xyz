/**
 * Paddle Payment Integration
 * Handles Paddle subscriptions for US/EU markets
 */

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('PaddlePayments');

interface PaddleConfig {
  vendorId: string;
  apiKey: string;
  publicKey: string;
  environment: 'sandbox' | 'production';
}

interface PaddleSubscription {
  subscriptionId: string;
  customerId: string;
  planId: string;
  status: string;
  nextPayment: {
    amount: number;
    currency: string;
    date: string;
  };
}

interface PaddleCheckoutOptions {
  priceId: string;
  customerId?: string;
  email: string;
  successUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Initialize Paddle client
 */
export function getPaddleClient(env: Env): PaddleConfig {
  const vendorId = env.PADDLE_VENDOR_ID;
  const apiKey = env.PADDLE_API_KEY;
  const publicKey = env.PADDLE_PUBLIC_KEY;
  const environment = (env.PADDLE_ENV as 'sandbox' | 'production') || 'sandbox';

  if (!vendorId || !apiKey) {
    throw new Error('Paddle credentials not configured');
  }

  return {
    vendorId: vendorId || '',
    apiKey: apiKey || '',
    publicKey: publicKey || '',
    environment
  };
}

/**
 * Create checkout session
 */
export async function createPaddleCheckout(
  options: PaddleCheckoutOptions,
  config: PaddleConfig
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const endpoint = config.environment === 'production'
    ? 'https://api.paddle.com/checkout/sessions'
    : 'https://sandbox-api.paddle.com/checkout/sessions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      items: [{
        price_id: options.priceId,
        quantity: 1
      }],
      customer_id: options.customerId,
      customer_email: options.email,
      custom_data: options.metadata,
      success_url: options.successUrl,
      cancel_url: options.cancelUrl || options.successUrl
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Paddle checkout failed (${response.status}):`, errorBody);
    throw new Error('Paddle checkout failed');
  }

  const data = await response.json() as any;
  return {
    checkoutUrl: data.data.checkout.url,
    sessionId: data.data.id
  };
}

/**
 * Get subscription details
 */
export async function getPaddleSubscription(
  subscriptionId: string,
  config: PaddleConfig
): Promise<PaddleSubscription> {
  const endpoint = config.environment === 'production'
    ? `https://api.paddle.com/subscriptions/${subscriptionId}`
    : `https://sandbox-api.paddle.com/subscriptions/${subscriptionId}`;

  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${config.apiKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Failed to get Paddle subscription (${response.status}):`, errorBody);
    throw new Error('Failed to get Paddle subscription');
  }

  const data = await response.json() as any;
  const sub = data.data;

  return {
    subscriptionId: sub.id,
    customerId: sub.customer_id,
    planId: sub.items[0]?.price_id || '',
    status: sub.status,
    nextPayment: {
      amount: sub.next_billed_at ? parseFloat(sub.billing_details?.payment_terms?.interval) : 0,
      currency: sub.currency_code || 'USD',
      date: sub.next_billed_at || ''
    }
  };
}

/**
 * Cancel subscription
 */
export async function cancelPaddleSubscription(
  subscriptionId: string,
  config: PaddleConfig,
  immediately: boolean = false
): Promise<void> {
  const endpoint = config.environment === 'production'
    ? `https://api.paddle.com/subscriptions/${subscriptionId}/cancel`
    : `https://sandbox-api.paddle.com/subscriptions/${subscriptionId}/cancel`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      effective_from: immediately ? 'immediately' : 'next_billing_period'
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Failed to cancel Paddle subscription (${response.status}):`, errorBody);
    throw new Error('Failed to cancel Paddle subscription');
  }
}

/**
 * Update subscription
 */
export async function updatePaddleSubscription(
  subscriptionId: string,
  newPriceId: string,
  config: PaddleConfig
): Promise<void> {
  const endpoint = config.environment === 'production'
    ? `https://api.paddle.com/subscriptions/${subscriptionId}`
    : `https://sandbox-api.paddle.com/subscriptions/${subscriptionId}`;

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      items: [{
        price_id: newPriceId,
        quantity: 1
      }],
      proration_billing_mode: 'prorated_immediately'
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`Failed to update Paddle subscription (${response.status}):`, errorBody);
    throw new Error('Failed to update Paddle subscription');
  }
}

/**
 * Verify webhook signature
 */
export function verifyPaddleWebhook(
  signature: string,
  body: string,
  publicKey: string
): boolean {
  try {
    // Paddle uses TS1 signature format with public key verification
    // This is a simplified version - in production, use crypto library
    const crypto = require('crypto');

    // Extract signature components
    const [ts, h1] = signature.split(';');
    const timestamp = ts.split('=')[1];
    const hash = h1.split('=')[1];

    // Verify timestamp (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    const eventTime = parseInt(timestamp);
    if (Math.abs(now - eventTime) > 300) { // 5 minutes tolerance
      return false;
    }

    // Verify signature
    const signedPayload = `${timestamp}:${body}`;
    const expectedHash = crypto
      .createHmac('sha256', publicKey)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(expectedHash)
    );
  } catch (error) {
    logger.error('Paddle webhook verification failed:', error);
    return false;
  }
}

/**
 * Process Paddle webhook event
 */
export async function processPaddleWebhook(
  eventType: string,
  eventData: any,
  db: any // Your database client
): Promise<void> {
  logger.info(`Processing Paddle webhook: ${eventType}`);

  switch (eventType) {
    case 'subscription.created':
    case 'subscription.activated':
      await handleSubscriptionActivated(eventData, db);
      break;

    case 'subscription.updated':
      await handleSubscriptionUpdated(eventData, db);
      break;

    case 'subscription.canceled':
    case 'subscription.past_due':
      await handleSubscriptionCanceled(eventData, db);
      break;

    case 'transaction.completed':
      await handlePaymentSucceeded(eventData, db);
      break;

    case 'transaction.payment_failed':
      await handlePaymentFailed(eventData, db);
      break;

    default:
      logger.info(`Unhandled Paddle event: ${eventType}`);
  }
}

async function handleSubscriptionActivated(data: any, db: any) {
  const customerId = data.customer_id;
  const subscriptionId = data.id;
  const priceId = data.items[0]?.price_id;

  // Map price ID to plan
  const planMap: Record<string, { id: string; limit: number }> = {
    'pri_paddle_pro': { id: 'pro', limit: 10000 },
    'pri_paddle_enterprise': { id: 'enterprise', limit: 100000 }
  };

  const plan = planMap[priceId] || { id: 'pro', limit: 10000 };

  await db.execute(`
    INSERT INTO subscriptions (
      user_id, provider, subscription_id, customer_id,
      plan_id, status, amount, currency,
      current_period_start, current_period_end, monthly_request_limit
    )
    SELECT
      id, 'paddle', $1, $2,
      $3, 'active', $4, $5,
      $6, $7, $8
    FROM users
    WHERE email = $9
    ON CONFLICT (subscription_id) DO UPDATE SET
      status = 'active',
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end
  `, [
    subscriptionId,
    customerId,
    plan.id,
    parseFloat(data.billing_details?.totals?.total || '0') / 100,
    data.currency_code,
    new Date(data.current_billing_period?.starts_at),
    new Date(data.current_billing_period?.ends_at),
    plan.limit,
    data.customer_email
  ]);

  logger.info(` Paddle subscription activated: ${subscriptionId}`);
}

async function handleSubscriptionUpdated(data: any, db: any) {
  const subscriptionId = data.id;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = $1,
      current_period_start = $2,
      current_period_end = $3,
      updated_at = NOW()
    WHERE subscription_id = $4
  `, [
    data.status,
    new Date(data.current_billing_period?.starts_at),
    new Date(data.current_billing_period?.ends_at),
    subscriptionId
  ]);

  logger.info(` Paddle subscription updated: ${subscriptionId}`);
}

async function handleSubscriptionCanceled(data: any, db: any) {
  const subscriptionId = data.id;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscriptionId]);

  logger.info(` Paddle subscription canceled: ${subscriptionId}`);
}

async function handlePaymentSucceeded(data: any, db: any) {
  const transactionId = data.id;
  const subscriptionId = data.subscription_id;

  await db.execute(`
    INSERT INTO payment_transactions (
      user_id, subscription_id, provider, transaction_id,
      amount, currency, status, payment_method, receipt_url
    )
    SELECT
      s.user_id, s.id, 'paddle', $1,
      $2, $3, 'succeeded', $4, $5
    FROM subscriptions s
    WHERE s.subscription_id = $6
  `, [
    transactionId,
    parseFloat(data.details?.totals?.total || '0') / 100,
    data.currency_code,
    data.payments[0]?.method_details?.type || 'card',
    data.receipt_url,
    subscriptionId
  ]);

  logger.info(` Paddle payment succeeded: ${transactionId}`);
}

async function handlePaymentFailed(data: any, db: any) {
  const transactionId = data.id;
  const subscriptionId = data.subscription_id;

  await db.execute(`
    INSERT INTO payment_transactions (
      user_id, subscription_id, provider, transaction_id,
      amount, currency, status
    )
    SELECT
      s.user_id, s.id, 'paddle', $1,
      $2, $3, 'failed'
    FROM subscriptions s
    WHERE s.subscription_id = $4
  `, [
    transactionId,
    parseFloat(data.details?.totals?.total || '0') / 100,
    data.currency_code,
    subscriptionId
  ]);

  // Update subscription to past_due
  await db.execute(`
    UPDATE subscriptions
    SET status = 'past_due'
    WHERE subscription_id = $1
  `, [subscriptionId]);

  logger.info(`L Paddle payment failed: ${transactionId}`);
}
