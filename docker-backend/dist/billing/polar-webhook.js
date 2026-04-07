"use strict";
/**
 * Polar.sh Webhook Handler
 * Handles incoming webhooks from Polar.sh for subscription and payment events
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onWebhookEvent = onWebhookEvent;
exports.getCustomerByPolarId = getCustomerByPolarId;
exports.getCustomerByUserId = getCustomerByUserId;
exports.createCustomerRecord = createCustomerRecord;
exports.getSubscriptionByPolarId = getSubscriptionByPolarId;
exports.getSubscriptionsByUserId = getSubscriptionsByUserId;
exports.getActiveSubscriptionByUserId = getActiveSubscriptionByUserId;
exports.createSubscriptionRecord = createSubscriptionRecord;
exports.updateSubscriptionRecord = updateSubscriptionRecord;
exports.getWebhookLogs = getWebhookLogs;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.createWebhookHandler = createWebhookHandler;
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
const persistence_js_1 = require("../persistence.js");
const webhookHandlers = {};
/**
 * Register a handler for a webhook event
 */
function onWebhookEvent(event, handler) {
    webhookHandlers[event] = handler;
}
function loadBillingStore() {
    return (0, persistence_js_1.loadStore)('billing', {
        customers: [],
        customersByPolarId: [],
        subscriptions: [],
        subscriptionsByPolarId: [],
        subscriptionsByUser: [],
        webhookLogs: [],
    });
}
function saveBillingStore() {
    const data = {
        customers: Array.from(customers.entries()),
        customersByPolarId: Array.from(customersByPolarId.entries()),
        subscriptions: Array.from(subscriptions.entries()),
        subscriptionsByPolarId: Array.from(subscriptionsByPolarId.entries()),
        subscriptionsByUser: Array.from(subscriptionsByUser.entries()),
        webhookLogs,
    };
    (0, persistence_js_1.debouncedSave)('billing', data);
}
// Load persisted data
const _stored = loadBillingStore();
// Storage maps (initialized from persisted data)
const customers = new Map(_stored.customers);
const customersByPolarId = new Map(_stored.customersByPolarId);
const subscriptions = new Map(_stored.subscriptions);
const subscriptionsByPolarId = new Map(_stored.subscriptionsByPolarId);
const subscriptionsByUser = new Map(_stored.subscriptionsByUser);
const webhookLogs = _stored.webhookLogs;
// ==================== Storage Functions ====================
function getCustomerByPolarId(polarCustomerId) {
    return customersByPolarId.get(polarCustomerId);
}
function getCustomerByUserId(userId) {
    for (const customer of customers.values()) {
        if (customer.userId === userId) {
            return customer;
        }
    }
    return undefined;
}
function createCustomerRecord(params) {
    const now = new Date();
    const record = {
        id: (0, uuid_1.v4)(),
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
function getSubscriptionByPolarId(polarSubscriptionId) {
    return subscriptionsByPolarId.get(polarSubscriptionId);
}
function getSubscriptionsByUserId(userId) {
    return subscriptionsByUser.get(userId) || [];
}
function getActiveSubscriptionByUserId(userId) {
    const subs = subscriptionsByUser.get(userId) || [];
    return subs.find(s => s.status === 'active' || s.status === 'trialing');
}
function createSubscriptionRecord(params) {
    const now = new Date();
    const record = {
        id: (0, uuid_1.v4)(),
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
function updateSubscriptionRecord(polarSubscriptionId, updates) {
    const record = subscriptionsByPolarId.get(polarSubscriptionId);
    if (!record)
        return undefined;
    const updated = {
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
function logWebhook(event, payload, status, error) {
    webhookLogs.push({
        id: (0, uuid_1.v4)(),
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
function getWebhookLogs(limit = 100) {
    return webhookLogs.slice(-limit).reverse();
}
// ==================== Default Event Handlers ====================
// Checkout completed
onWebhookEvent('checkout.updated', async (data) => {
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
                userId: data.metadata.userId,
                email: data.customer_email || '',
            });
        }
    }
});
// Subscription created
onWebhookEvent('subscription.created', async (data) => {
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
onWebhookEvent('subscription.updated', async (data) => {
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
onWebhookEvent('subscription.active', async (data) => {
    console.log(`[Billing] Subscription activated: ${data.id}`);
    updateSubscriptionRecord(data.id, {
        status: 'active',
        currentPeriodStart: new Date(data.current_period_start),
        currentPeriodEnd: new Date(data.current_period_end),
    });
});
// Subscription canceled
onWebhookEvent('subscription.canceled', async (data) => {
    console.log(`[Billing] Subscription canceled: ${data.id}`);
    updateSubscriptionRecord(data.id, {
        status: 'canceled',
        cancelAtPeriodEnd: data.cancel_at_period_end,
    });
});
// Subscription revoked
onWebhookEvent('subscription.revoked', async (data) => {
    console.log(`[Billing] Subscription revoked: ${data.id}`);
    updateSubscriptionRecord(data.id, {
        status: 'canceled',
    });
});
// Order created
onWebhookEvent('order.created', async (data) => {
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
function verifyWebhookSignature(payload, signature, webhookSecret) {
    try {
        // Polar uses format: "sha256=<signature>"
        const [algorithm, sig] = signature.split('=');
        if (algorithm !== 'sha256' || !sig) {
            return false;
        }
        const expectedSignature = (0, crypto_1.createHmac)('sha256', webhookSecret)
            .update(payload)
            .digest('hex');
        return (0, crypto_1.timingSafeEqual)(Buffer.from(sig), Buffer.from(expectedSignature));
    }
    catch (error) {
        console.error('[Billing] Signature verification error:', error);
        return false;
    }
}
// ==================== Express Middleware ====================
/**
 * Express middleware for handling Polar.sh webhooks
 */
function createWebhookHandler(webhookSecret) {
    return async (req, res) => {
        const signature = req.headers['polar-signature'] || req.headers['x-polar-signature'];
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
        let payload;
        try {
            payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        }
        catch (error) {
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
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[Billing] Webhook handler error for ${type}:`, error);
                logWebhook(type, payload, 'failed', errorMessage);
                // Return 200 to prevent retries for handler errors
                // Polar.sh will retry on 5xx errors
                res.status(200).json({ received: true, error: 'Handler error' });
            }
        }
        else {
            console.log(`[Billing] No handler for webhook event: ${type}`);
            logWebhook(type, payload, 'success');
            res.status(200).json({ received: true, unhandled: true });
        }
    };
}
