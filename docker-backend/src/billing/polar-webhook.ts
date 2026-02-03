/**
 * Polar.sh Webhook Handler
 * Handles incoming webhooks from Polar.sh for subscription and payment events
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Types ====================

export type PolarWebhookEvent =
  | 'checkout.created'
  | 'checkout.updated'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'subscription.active'
  | 'subscription.revoked'
  | 'order.created';

export interface WebhookPayload<T = unknown> {
  type: PolarWebhookEvent;
  data: T;
  created_at: string;
}

export interface CheckoutData {
  id: string;
  status: 'open' | 'expired' | 'succeeded' | 'confirmed';
  customer_id?: string;
  customer_email?: string;
  product_id: string;
  price_id: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  subscription_id?: string;
}

export interface SubscriptionData {
  id: string;
  customer_id: string;
  product_id: string;
  price_id: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  ended_at?: string;
  metadata?: Record<string, unknown>;
}

export interface OrderData {
  id: string;
  customer_id: string;
  product_id: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, unknown>;
}

// ==================== Event Handlers ====================

type WebhookHandler<T> = (data: T) => Promise<void>;

const webhookHandlers: Partial<Record<PolarWebhookEvent, WebhookHandler<unknown>>> = {};

/**
 * Register a handler for a webhook event
 */
export function onWebhookEvent<T>(
  event: PolarWebhookEvent,
  handler: WebhookHandler<T>
): void {
  webhookHandlers[event] = handler as WebhookHandler<unknown>;
}

// ==================== In-Memory Storage ====================
// In production, this would be replaced with a database

interface CustomerRecord {
  id: string;
  polarCustomerId: string;
  userId: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SubscriptionRecord {
  id: string;
  polarSubscriptionId: string;
  customerId: string;
  userId: string;
  productId: string;
  priceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface WebhookLogEntry {
  id: string;
  event: PolarWebhookEvent;
  payload: unknown;
  status: 'success' | 'failed';
  error?: string;
  processedAt: Date;
}

// ==================== Persistence Helpers ====================

interface BillingStoreData {
  customers: [string, CustomerRecord][];
  customersByPolarId: [string, CustomerRecord][];
  subscriptions: [string, SubscriptionRecord][];
  subscriptionsByPolarId: [string, SubscriptionRecord][];
  subscriptionsByUser: [string, SubscriptionRecord[]][];
  webhookLogs: WebhookLogEntry[];
}

function loadBillingStore(): BillingStoreData {
  return loadStore<BillingStoreData>('billing', {
    customers: [],
    customersByPolarId: [],
    subscriptions: [],
    subscriptionsByPolarId: [],
    subscriptionsByUser: [],
    webhookLogs: [],
  });
}

function saveBillingStore(): void {
  const data: BillingStoreData = {
    customers: Array.from(customers.entries()),
    customersByPolarId: Array.from(customersByPolarId.entries()),
    subscriptions: Array.from(subscriptions.entries()),
    subscriptionsByPolarId: Array.from(subscriptionsByPolarId.entries()),
    subscriptionsByUser: Array.from(subscriptionsByUser.entries()),
    webhookLogs,
  };
  debouncedSave('billing', data);
}

// Load persisted data
const _stored = loadBillingStore();

// Storage maps (initialized from persisted data)
const customers = new Map<string, CustomerRecord>(_stored.customers);
const customersByPolarId = new Map<string, CustomerRecord>(_stored.customersByPolarId);
const subscriptions = new Map<string, SubscriptionRecord>(_stored.subscriptions);
const subscriptionsByPolarId = new Map<string, SubscriptionRecord>(_stored.subscriptionsByPolarId);
const subscriptionsByUser = new Map<string, SubscriptionRecord[]>(_stored.subscriptionsByUser);
const webhookLogs: WebhookLogEntry[] = _stored.webhookLogs;

// ==================== Storage Functions ====================

export function getCustomerByPolarId(polarCustomerId: string): CustomerRecord | undefined {
  return customersByPolarId.get(polarCustomerId);
}

export function getCustomerByUserId(userId: string): CustomerRecord | undefined {
  for (const customer of customers.values()) {
    if (customer.userId === userId) {
      return customer;
    }
  }
  return undefined;
}

export function createCustomerRecord(params: {
  polarCustomerId: string;
  userId: string;
  email: string;
}): CustomerRecord {
  const now = new Date();
  const record: CustomerRecord = {
    id: uuid(),
    polarCustomerId: params.polarCustomerId,
    userId: params.userId,
    email: params.email,
    createdAt: now,
    updatedAt: now,
  };

  customers.set(record.id, record);
  customersByPolarId.set(params.polarCustomerId, record);
  saveBillingStore();
  return record;
}

export function getSubscriptionByPolarId(polarSubscriptionId: string): SubscriptionRecord | undefined {
  return subscriptionsByPolarId.get(polarSubscriptionId);
}

export function getSubscriptionsByUserId(userId: string): SubscriptionRecord[] {
  return subscriptionsByUser.get(userId) || [];
}

export function getActiveSubscriptionByUserId(userId: string): SubscriptionRecord | undefined {
  const subs = subscriptionsByUser.get(userId) || [];
  return subs.find(s => s.status === 'active' || s.status === 'trialing');
}

export function createSubscriptionRecord(params: {
  polarSubscriptionId: string;
  customerId: string;
  userId: string;
  productId: string;
  priceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, unknown>;
}): SubscriptionRecord {
  const now = new Date();
  const record: SubscriptionRecord = {
    id: uuid(),
    ...params,
    createdAt: now,
    updatedAt: now,
  };

  subscriptions.set(record.id, record);
  subscriptionsByPolarId.set(params.polarSubscriptionId, record);

  // Update user subscriptions list
  const userSubs = subscriptionsByUser.get(params.userId) || [];
  userSubs.push(record);
  subscriptionsByUser.set(params.userId, userSubs);

  saveBillingStore();
  return record;
}

export function updateSubscriptionRecord(
  polarSubscriptionId: string,
  updates: Partial<SubscriptionRecord>
): SubscriptionRecord | undefined {
  const record = subscriptionsByPolarId.get(polarSubscriptionId);
  if (!record) return undefined;

  const updated: SubscriptionRecord = {
    ...record,
    ...updates,
    updatedAt: new Date(),
  };

  subscriptions.set(record.id, updated);
  subscriptionsByPolarId.set(polarSubscriptionId, updated);

  // Update in user subscriptions list
  const userSubs = subscriptionsByUser.get(record.userId) || [];
  const idx = userSubs.findIndex(s => s.id === record.id);
  if (idx !== -1) {
    userSubs[idx] = updated;
    subscriptionsByUser.set(record.userId, userSubs);
  }

  saveBillingStore();
  return updated;
}

function logWebhook(
  event: PolarWebhookEvent,
  payload: unknown,
  status: 'success' | 'failed',
  error?: string
): void {
  webhookLogs.push({
    id: uuid(),
    event,
    payload,
    status,
    error,
    processedAt: new Date(),
  });

  // Keep only last 1000 entries
  if (webhookLogs.length > 1000) {
    webhookLogs.shift();
  }

  saveBillingStore();
}

export function getWebhookLogs(limit: number = 100): WebhookLogEntry[] {
  return webhookLogs.slice(-limit).reverse();
}

// ==================== Default Event Handlers ====================

// Checkout completed
onWebhookEvent<CheckoutData>('checkout.updated', async (data) => {
  if (data.status !== 'confirmed' && data.status !== 'succeeded') {
    return;
  }

  console.log(`[Billing] Checkout completed: ${data.id}`, {
    customerId: data.customer_id,
    productId: data.product_id,
    subscriptionId: data.subscription_id,
  });

  // Create or update customer record if needed
  if (data.customer_id && data.metadata?.userId) {
    const existing = getCustomerByPolarId(data.customer_id);
    if (!existing) {
      createCustomerRecord({
        polarCustomerId: data.customer_id,
        userId: data.metadata.userId as string,
        email: data.customer_email || '',
      });
    }
  }
});

// Subscription created
onWebhookEvent<SubscriptionData>('subscription.created', async (data) => {
  console.log(`[Billing] Subscription created: ${data.id}`, {
    customerId: data.customer_id,
    status: data.status,
  });

  // Get customer to find userId
  const customer = getCustomerByPolarId(data.customer_id);
  if (!customer) {
    console.warn(`[Billing] Customer not found for subscription: ${data.customer_id}`);
    return;
  }

  // Create subscription record
  createSubscriptionRecord({
    polarSubscriptionId: data.id,
    customerId: customer.id,
    userId: customer.userId,
    productId: data.product_id,
    priceId: data.price_id,
    status: data.status,
    currentPeriodStart: new Date(data.current_period_start),
    currentPeriodEnd: new Date(data.current_period_end),
    cancelAtPeriodEnd: data.cancel_at_period_end,
    metadata: data.metadata,
  });
});

// Subscription updated
onWebhookEvent<SubscriptionData>('subscription.updated', async (data) => {
  console.log(`[Billing] Subscription updated: ${data.id}`, {
    status: data.status,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  });

  updateSubscriptionRecord(data.id, {
    status: data.status,
    productId: data.product_id,
    priceId: data.price_id,
    currentPeriodStart: new Date(data.current_period_start),
    currentPeriodEnd: new Date(data.current_period_end),
    cancelAtPeriodEnd: data.cancel_at_period_end,
    metadata: data.metadata,
  });
});

// Subscription active
onWebhookEvent<SubscriptionData>('subscription.active', async (data) => {
  console.log(`[Billing] Subscription activated: ${data.id}`);

  updateSubscriptionRecord(data.id, {
    status: 'active',
    currentPeriodStart: new Date(data.current_period_start),
    currentPeriodEnd: new Date(data.current_period_end),
  });
});

// Subscription canceled
onWebhookEvent<SubscriptionData>('subscription.canceled', async (data) => {
  console.log(`[Billing] Subscription canceled: ${data.id}`);

  updateSubscriptionRecord(data.id, {
    status: 'canceled',
    cancelAtPeriodEnd: data.cancel_at_period_end,
  });
});

// Subscription revoked
onWebhookEvent<SubscriptionData>('subscription.revoked', async (data) => {
  console.log(`[Billing] Subscription revoked: ${data.id}`);

  updateSubscriptionRecord(data.id, {
    status: 'canceled',
  });
});

// Order created
onWebhookEvent<OrderData>('order.created', async (data) => {
  console.log(`[Billing] Order created: ${data.id}`, {
    customerId: data.customer_id,
    amount: data.amount,
  });
  // Handle one-time purchases if needed
});

// ==================== Webhook Verification ====================

/**
 * Verify Polar.sh webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    // Polar uses format: "sha256=<signature>"
    const [algorithm, sig] = signature.split('=');
    if (algorithm !== 'sha256' || !sig) {
      return false;
    }

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    return timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[Billing] Signature verification error:', error);
    return false;
  }
}

// ==================== Express Middleware ====================

/**
 * Express middleware for handling Polar.sh webhooks
 */
export function createWebhookHandler(webhookSecret: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['polar-signature'] as string || req.headers['x-polar-signature'] as string;

    if (!signature) {
      console.warn('[Billing] Webhook missing signature');
      res.status(401).json({ error: 'Missing signature' });
      return;
    }

    // Get raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.warn('[Billing] Webhook signature verification failed');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Parse payload
    let payload: WebhookPayload;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (error) {
      console.error('[Billing] Failed to parse webhook payload:', error);
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const { type, data } = payload;

    console.log(`[Billing] Received webhook: ${type}`);

    // Get handler for this event type
    const handler = webhookHandlers[type];

    if (handler) {
      try {
        await handler(data);
        logWebhook(type, payload, 'success');
        res.status(200).json({ received: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Billing] Webhook handler error for ${type}:`, error);
        logWebhook(type, payload, 'failed', errorMessage);
        // Return 200 to prevent retries for handler errors
        // Polar.sh will retry on 5xx errors
        res.status(200).json({ received: true, error: 'Handler error' });
      }
    } else {
      console.log(`[Billing] No handler for webhook event: ${type}`);
      logWebhook(type, payload, 'success');
      res.status(200).json({ received: true, unhandled: true });
    }
  };
}

// ==================== Exports ====================

export {
  CustomerRecord,
  SubscriptionRecord,
  WebhookLogEntry,
};
