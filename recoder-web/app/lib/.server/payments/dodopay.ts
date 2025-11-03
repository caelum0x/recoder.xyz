/**
 * DodoPay Payment Integration
 * Handles DodoPay subscriptions for Asian markets (Alipay, WeChat Pay, UnionPay)
 */

interface DodoPayConfig {
  merchantId: string;
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
}

interface DodoPaySubscription {
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

interface DodoPayCheckoutOptions {
  productId: string;
  customerId?: string;
  email: string;
  amount: number;
  currency: string;
  returnUrl: string;
  notifyUrl: string;
  metadata?: Record<string, any>;
}

/**
 * Initialize DodoPay client
 */
export function getDodoPayClient(env: Env): DodoPayConfig {
  const merchantId = env.DODOPAY_MERCHANT_ID;
  const apiKey = env.DODOPAY_API_KEY;
  const apiSecret = env.DODOPAY_API_SECRET;
  const environment = (env.DODOPAY_ENV as 'sandbox' | 'production') || 'sandbox';

  if (!merchantId || !apiKey || !apiSecret) {
    throw new Error('DodoPay credentials not configured');
  }

  return {
    merchantId,
    apiKey,
    apiSecret,
    environment
  };
}

/**
 * Generate DodoPay signature for request authentication
 */
function generateDodoPaySignature(
  params: Record<string, any>,
  apiSecret: string
): string {
  const crypto = require('crypto');

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort();
  const signString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&') + `&key=${apiSecret}`;

  return crypto
    .createHash('md5')
    .update(signString)
    .digest('hex')
    .toUpperCase();
}

/**
 * Create checkout session
 */
export async function createDodoPayCheckout(
  options: DodoPayCheckoutOptions,
  config: DodoPayConfig
): Promise<{ checkoutUrl: string; orderId: string }> {
  const endpoint = config.environment === 'production'
    ? 'https://api.dodopay.com/v1/order/create'
    : 'https://sandbox.dodopay.com/v1/order/create';

  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const params = {
    merchant_id: config.merchantId,
    out_trade_no: orderId,
    product_id: options.productId,
    total_amount: Math.round(options.amount * 100), // Convert to cents
    currency: options.currency,
    customer_email: options.email,
    customer_id: options.customerId || '',
    return_url: options.returnUrl,
    notify_url: options.notifyUrl,
    timestamp: Date.now().toString(),
    metadata: JSON.stringify(options.metadata || {})
  };

  const signature = generateDodoPaySignature(params, config.apiSecret);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DodoPay-Key': config.apiKey
    },
    body: JSON.stringify({
      ...params,
      sign: signature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DodoPay checkout failed: ${error}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`DodoPay error: ${data.message}`);
  }

  return {
    checkoutUrl: data.data.payment_url,
    orderId: orderId
  };
}

/**
 * Get subscription details
 */
export async function getDodoPaySubscription(
  subscriptionId: string,
  config: DodoPayConfig
): Promise<DodoPaySubscription> {
  const endpoint = config.environment === 'production'
    ? 'https://api.dodopay.com/v1/subscription/query'
    : 'https://sandbox.dodopay.com/v1/subscription/query';

  const params = {
    merchant_id: config.merchantId,
    subscription_id: subscriptionId,
    timestamp: Date.now().toString()
  };

  const signature = generateDodoPaySignature(params, config.apiSecret);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DodoPay-Key': config.apiKey
    },
    body: JSON.stringify({
      ...params,
      sign: signature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get DodoPay subscription: ${error}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`DodoPay error: ${data.message}`);
  }

  const sub = data.data;

  return {
    subscriptionId: sub.subscription_id,
    customerId: sub.customer_id,
    planId: sub.plan_id,
    status: sub.status,
    nextPayment: {
      amount: parseFloat(sub.next_payment_amount) / 100,
      currency: sub.currency,
      date: sub.next_payment_date
    }
  };
}

/**
 * Cancel subscription
 */
export async function cancelDodoPaySubscription(
  subscriptionId: string,
  config: DodoPayConfig,
  immediately: boolean = false
): Promise<void> {
  const endpoint = config.environment === 'production'
    ? 'https://api.dodopay.com/v1/subscription/cancel'
    : 'https://sandbox.dodopay.com/v1/subscription/cancel';

  const params = {
    merchant_id: config.merchantId,
    subscription_id: subscriptionId,
    cancel_type: immediately ? 'immediately' : 'at_period_end',
    timestamp: Date.now().toString()
  };

  const signature = generateDodoPaySignature(params, config.apiSecret);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DodoPay-Key': config.apiKey
    },
    body: JSON.stringify({
      ...params,
      sign: signature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to cancel DodoPay subscription: ${error}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`DodoPay error: ${data.message}`);
  }
}

/**
 * Update subscription plan
 */
export async function updateDodoPaySubscription(
  subscriptionId: string,
  newPlanId: string,
  config: DodoPayConfig
): Promise<void> {
  const endpoint = config.environment === 'production'
    ? 'https://api.dodopay.com/v1/subscription/update'
    : 'https://sandbox.dodopay.com/v1/subscription/update';

  const params = {
    merchant_id: config.merchantId,
    subscription_id: subscriptionId,
    new_plan_id: newPlanId,
    proration: 'create_prorations',
    timestamp: Date.now().toString()
  };

  const signature = generateDodoPaySignature(params, config.apiSecret);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DodoPay-Key': config.apiKey
    },
    body: JSON.stringify({
      ...params,
      sign: signature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update DodoPay subscription: ${error}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`DodoPay error: ${data.message}`);
  }
}

/**
 * Verify webhook signature
 */
export function verifyDodoPayWebhook(
  signature: string,
  body: Record<string, any>,
  apiSecret: string
): boolean {
  try {
    // DodoPay uses MD5 signature
    const expectedSignature = generateDodoPaySignature(body, apiSecret);
    return signature === expectedSignature;
  } catch (error) {
    console.error('DodoPay webhook verification failed:', error);
    return false;
  }
}

/**
 * Process DodoPay webhook event
 */
export async function processDodoPayWebhook(
  eventType: string,
  eventData: any,
  db: any
): Promise<void> {
  console.log(`Processing DodoPay webhook: ${eventType}`);

  switch (eventType) {
    case 'subscription.created':
    case 'subscription.activated':
      await handleDodoSubscriptionActivated(eventData, db);
      break;

    case 'subscription.updated':
      await handleDodoSubscriptionUpdated(eventData, db);
      break;

    case 'subscription.canceled':
    case 'subscription.expired':
      await handleDodoSubscriptionCanceled(eventData, db);
      break;

    case 'payment.succeeded':
      await handleDodoPaymentSucceeded(eventData, db);
      break;

    case 'payment.failed':
      await handleDodoPaymentFailed(eventData, db);
      break;

    default:
      console.log(`Unhandled DodoPay event: ${eventType}`);
  }
}

async function handleDodoSubscriptionActivated(data: any, db: any) {
  const customerId = data.customer_id;
  const subscriptionId = data.subscription_id;
  const planId = data.plan_id;

  // Map plan ID to limits
  const planMap: Record<string, { id: string; limit: number }> = {
    'plan_dodopay_pro': { id: 'pro', limit: 10000 },
    'plan_dodopay_enterprise': { id: 'enterprise', limit: 100000 }
  };

  const plan = planMap[planId] || { id: 'pro', limit: 10000 };

  await db.execute(`
    INSERT INTO subscriptions (
      user_id, provider, subscription_id, customer_id,
      plan_id, status, amount, currency,
      current_period_start, current_period_end, monthly_request_limit
    )
    SELECT
      id, 'dodopay', $1, $2,
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
    parseFloat(data.amount) / 100,
    data.currency,
    new Date(data.current_period_start * 1000),
    new Date(data.current_period_end * 1000),
    plan.limit,
    data.customer_email
  ]);

  console.log(` DodoPay subscription activated: ${subscriptionId}`);
}

async function handleDodoSubscriptionUpdated(data: any, db: any) {
  const subscriptionId = data.subscription_id;

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
    new Date(data.current_period_start * 1000),
    new Date(data.current_period_end * 1000),
    subscriptionId
  ]);

  console.log(` DodoPay subscription updated: ${subscriptionId}`);
}

async function handleDodoSubscriptionCanceled(data: any, db: any) {
  const subscriptionId = data.subscription_id;

  await db.execute(`
    UPDATE subscriptions
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE subscription_id = $1
  `, [subscriptionId]);

  console.log(` DodoPay subscription canceled: ${subscriptionId}`);
}

async function handleDodoPaymentSucceeded(data: any, db: any) {
  const transactionId = data.transaction_id;
  const subscriptionId = data.subscription_id;

  await db.execute(`
    INSERT INTO payment_transactions (
      user_id, subscription_id, provider, transaction_id,
      amount, currency, status, payment_method
    )
    SELECT
      s.user_id, s.id, 'dodopay', $1,
      $2, $3, 'succeeded', $4
    FROM subscriptions s
    WHERE s.subscription_id = $5
  `, [
    transactionId,
    parseFloat(data.amount) / 100,
    data.currency,
    data.payment_method, // 'alipay', 'wechat', 'unionpay'
    subscriptionId
  ]);

  console.log(` DodoPay payment succeeded: ${transactionId}`);
}

async function handleDodoPaymentFailed(data: any, db: any) {
  const transactionId = data.transaction_id;
  const subscriptionId = data.subscription_id;

  await db.execute(`
    INSERT INTO payment_transactions (
      user_id, subscription_id, provider, transaction_id,
      amount, currency, status
    )
    SELECT
      s.user_id, s.id, 'dodopay', $1,
      $2, $3, 'failed'
    FROM subscriptions s
    WHERE s.subscription_id = $4
  `, [
    transactionId,
    parseFloat(data.amount) / 100,
    data.currency,
    subscriptionId
  ]);

  // Update subscription to past_due
  await db.execute(`
    UPDATE subscriptions
    SET status = 'past_due'
    WHERE subscription_id = $1
  `, [subscriptionId]);

  console.log(`L DodoPay payment failed: ${transactionId}`);
}
