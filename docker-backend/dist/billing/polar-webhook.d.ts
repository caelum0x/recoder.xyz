/**
 * Polar.sh Webhook Handler
 * Handles incoming webhooks from Polar.sh for subscription and payment events
 */
import type { Request, Response } from 'express';
export type PolarWebhookEvent = 'checkout.created' | 'checkout.updated' | 'subscription.created' | 'subscription.updated' | 'subscription.canceled' | 'subscription.active' | 'subscription.revoked' | 'order.created';
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
type WebhookHandler<T> = (data: T) => Promise<void>;
/**
 * Register a handler for a webhook event
 */
export declare function onWebhookEvent<T>(event: PolarWebhookEvent, handler: WebhookHandler<T>): void;
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
export declare function getCustomerByPolarId(polarCustomerId: string): CustomerRecord | undefined;
export declare function getCustomerByUserId(userId: string): CustomerRecord | undefined;
export declare function createCustomerRecord(params: {
    polarCustomerId: string;
    userId: string;
    email: string;
}): CustomerRecord;
export declare function getSubscriptionByPolarId(polarSubscriptionId: string): SubscriptionRecord | undefined;
export declare function getSubscriptionsByUserId(userId: string): SubscriptionRecord[];
export declare function getActiveSubscriptionByUserId(userId: string): SubscriptionRecord | undefined;
export declare function createSubscriptionRecord(params: {
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
}): SubscriptionRecord;
export declare function updateSubscriptionRecord(polarSubscriptionId: string, updates: Partial<SubscriptionRecord>): SubscriptionRecord | undefined;
export declare function getWebhookLogs(limit?: number): WebhookLogEntry[];
/**
 * Verify Polar.sh webhook signature
 */
export declare function verifyWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean;
/**
 * Express middleware for handling Polar.sh webhooks
 */
export declare function createWebhookHandler(webhookSecret: string): (req: Request, res: Response) => Promise<void>;
export { CustomerRecord, SubscriptionRecord, WebhookLogEntry, };
