/**
 * Polar.sh Billing Types
 * Type definitions for the Polar.sh payment platform integration
 */

// ==================== Subscription Status ====================

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

// ==================== Billing Interval ====================

export type BillingInterval = 'month' | 'year';

// ==================== Payment Method ====================

export interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank_account';
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  isDefault: boolean;
  createdAt: Date;
}

// ==================== Invoice ====================

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number; // in cents
  amount: number; // in cents
  priceId?: string;
  productId?: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  subscriptionId?: string;
  status: InvoiceStatus;
  currency: string;
  amountDue: number; // in cents
  amountPaid: number; // in cents
  amountRemaining: number; // in cents
  subtotal: number; // in cents
  tax?: number; // in cents
  total: number; // in cents
  lineItems: InvoiceLineItem[];
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate?: Date;
  paidAt?: Date;
  createdAt: Date;
}

// ==================== Usage Record ====================

export type UsageType =
  | 'sandbox_minutes'
  | 'ai_tokens'
  | 'storage_gb'
  | 'deployments'
  | 'api_requests';

export interface UsageRecord {
  id: string;
  subscriptionId: string;
  customerId: string;
  usageType: UsageType;
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  usageType: UsageType;
  current: number;
  limit: number;
  percentage: number;
  periodStart: Date;
  periodEnd: Date;
}

// ==================== Polar.sh Customer ====================

export interface PolarCustomer {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  organizationId?: string;
}

// ==================== Polar.sh Product & Price ====================

export interface PolarPrice {
  id: string;
  productId: string;
  currency: string;
  unitAmount: number; // in cents
  interval?: BillingInterval;
  intervalCount?: number;
  type: 'one_time' | 'recurring';
  metadata?: Record<string, unknown>;
}

export interface PolarProduct {
  id: string;
  name: string;
  description?: string;
  isArchived: boolean;
  prices: PolarPrice[];
  benefits: PolarBenefit[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PolarBenefit {
  id: string;
  type: string;
  description: string;
  properties?: Record<string, unknown>;
}

// ==================== Polar.sh Subscription ====================

export interface PolarSubscription {
  id: string;
  customerId: string;
  productId: string;
  priceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  endedAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  // Expanded fields
  customer?: PolarCustomer;
  product?: PolarProduct;
  price?: PolarPrice;
}

// ==================== Polar.sh Checkout ====================

export type CheckoutStatus =
  | 'open'
  | 'expired'
  | 'succeeded'
  | 'confirmed';

export interface PolarCheckout {
  id: string;
  url: string;
  status: CheckoutStatus;
  customerId?: string;
  customerEmail?: string;
  productId: string;
  priceId: string;
  amount: number; // in cents
  currency: string;
  successUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  confirmedAt?: Date;
  // Expanded fields
  product?: PolarProduct;
  subscription?: PolarSubscription;
}

// ==================== Webhook Events ====================

export type PolarWebhookEvent =
  | 'checkout.created'
  | 'checkout.updated'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'subscription.active'
  | 'subscription.revoked'
  | 'order.created';

export interface PolarWebhookPayload<T = unknown> {
  type: PolarWebhookEvent;
  data: T;
  createdAt: Date;
}

// ==================== Subscription Plans ====================

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanFeature {
  name: string;
  description?: string;
  included: boolean;
  limit?: number;
}

export interface SubscriptionPlan {
  id: string;
  tier: PlanTier;
  name: string;
  description: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number; // in cents
  features: PlanFeature[];
  limits: {
    sandboxMinutes: number;
    aiTokens: number;
    storageGb: number;
    deployments: number;
    apiRequests: number;
  };
  polarProductId?: string;
  polarPriceIds?: {
    monthly?: string;
    yearly?: string;
  };
}

// ==================== Billing State ====================

export interface BillingState {
  isLoading: boolean;
  error: string | null;
  customer: PolarCustomer | null;
  subscription: PolarSubscription | null;
  invoices: Invoice[];
  usageSummary: UsageSummary[];
  paymentMethods: PaymentMethod[];
}

// ==================== API Request/Response Types ====================

export interface CreateCheckoutRequest {
  productId: string;
  priceId: string;
  successUrl: string;
  cancelUrl?: string;
  customerEmail?: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCheckoutResponse {
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export interface ReportUsageRequest {
  subscriptionId: string;
  usageType: UsageType;
  quantity: number;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface CancelSubscriptionRequest {
  subscriptionId: string;
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}

// ==================== Error Types ====================

export class BillingError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.details = details;
  }
}

export const BillingErrorCodes = {
  CUSTOMER_NOT_FOUND: 'customer_not_found',
  SUBSCRIPTION_NOT_FOUND: 'subscription_not_found',
  CHECKOUT_FAILED: 'checkout_failed',
  PAYMENT_FAILED: 'payment_failed',
  USAGE_LIMIT_EXCEEDED: 'usage_limit_exceeded',
  INVALID_WEBHOOK: 'invalid_webhook',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
} as const;

// ==================== Utility Types ====================

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    totalCount: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

export interface DateRange {
  start: Date;
  end: Date;
}
