/**
 * Stripe Plugin for better-auth
 * Provides Stripe subscription management with webhook handling
 */

import type { AuthUser, AuthSession, Subscription, PlanLimits } from '../types';
import { getAuthEnv, isStripeConfigured } from '../env';

/**
 * Stripe checkout session parameters
 */
export interface CheckoutSessionParams {
  allow_promotion_codes?: boolean;
  tax_id_collection?: {
    enabled: boolean;
  };
  billing_address_collection?: 'required' | 'auto';
  custom_text?: {
    submit?: {
      message: string;
    };
  };
  metadata?: Record<string, string | undefined>;
}

/**
 * Plan definition for Stripe
 */
export interface StripePlan {
  name: string;
  priceId: string;
  annualDiscountPriceId?: string;
  limits?: Record<string, number>;
}

/**
 * Stripe plugin configuration
 */
export interface StripePluginConfig {
  /**
   * Stripe secret key
   */
  secretKey?: string;

  /**
   * Stripe webhook secret
   */
  webhookSecret?: string;

  /**
   * Whether to create a Stripe customer on user signup
   * @default true
   */
  createCustomerOnSignUp?: boolean;

  /**
   * Subscription configuration
   */
  subscription?: {
    enabled?: boolean;
    getCheckoutSessionParams?: (data: CheckoutSessionData) => Promise<CheckoutSessionResult>;
    plans?: () => Promise<StripePlan[]>;
    authorizeReference?: (params: AuthorizeReferenceParams) => Promise<boolean>;
    onSubscriptionComplete?: (params: SubscriptionCompleteParams) => Promise<void>;
    onSubscriptionUpdate?: (params: SubscriptionUpdateParams) => Promise<void>;
    onSubscriptionCancel?: (params: SubscriptionCancelParams) => Promise<void>;
    onSubscriptionDeleted?: (params: SubscriptionDeletedParams) => Promise<void>;
  };

  /**
   * Called for any Stripe webhook event
   */
  onEvent?: (event: StripeEvent) => Promise<void>;

  /**
   * Called when a Stripe customer is created
   */
  onCustomerCreate?: (params: CustomerCreateParams) => Promise<void>;
}

export interface CheckoutSessionData {
  user: AuthUser & Record<string, any>;
  session: AuthSession & Record<string, any>;
  plan: StripePlan;
  subscription: Subscription;
}

export interface CheckoutSessionResult {
  params: CheckoutSessionParams;
  options?: {
    idempotencyKey?: string;
  };
}

export interface AuthorizeReferenceParams {
  user: AuthUser;
  session: AuthSession;
  referenceId: string;
  action: 'upgrade-subscription' | 'cancel-subscription' | 'restore-subscription' | string;
}

export interface SubscriptionCompleteParams {
  event: StripeEvent;
  subscription: Subscription;
  stripeSubscription: any;
  plan: StripePlan;
}

export interface SubscriptionUpdateParams {
  event: StripeEvent;
  subscription: Subscription;
  stripeSubscription: any;
}

export interface SubscriptionCancelParams {
  event: StripeEvent;
  subscription: Subscription;
  stripeSubscription: any;
  cancellationDetails?: any;
}

export interface SubscriptionDeletedParams {
  event: StripeEvent;
  subscription: Subscription;
  stripeSubscription: any;
}

export interface CustomerCreateParams {
  customer: any;
  stripeCustomer: any;
  user: AuthUser;
  request?: Request;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}

/**
 * Default checkout session parameters
 */
async function defaultGetCheckoutSessionParams(
  data: CheckoutSessionData
): Promise<CheckoutSessionResult> {
  return {
    params: {
      allow_promotion_codes: true,
      tax_id_collection: {
        enabled: true,
      },
      billing_address_collection: 'required',
      custom_text: {
        submit: {
          message: "We'll start your subscription right away",
        },
      },
      metadata: {
        planType: data.plan?.name,
        referralCode: (data.user as any).metadata?.referralCode,
      },
    },
    options: {
      idempotencyKey: `sub_${data.user.id}_${data.plan?.name}_${Date.now()}`,
    },
  };
}

/**
 * Default plans getter (should be overridden with actual DB query)
 */
async function defaultGetPlans(): Promise<StripePlan[]> {
  // Default plans - these should be fetched from database in production
  return [
    {
      name: 'recoder free',
      priceId: '',
      limits: { ai_nums: 5, seats: 1, project_nums: 1 },
    },
    {
      name: 'recoder pro',
      priceId: process.env.STRIPE_PRO_PRICE_ID || '',
      annualDiscountPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
      limits: { ai_nums: 100, seats: 3, project_nums: 10 },
    },
    {
      name: 'recoder max',
      priceId: process.env.STRIPE_MAX_PRICE_ID || '',
      annualDiscountPriceId: process.env.STRIPE_MAX_ANNUAL_PRICE_ID || '',
      limits: { ai_nums: 500, seats: 10, project_nums: 50 },
    },
  ];
}

/**
 * Default authorization check
 */
async function defaultAuthorizeReference(params: AuthorizeReferenceParams): Promise<boolean> {
  // Default: allow all authorized users
  // In production, check organization membership and role
  const { action } = params;

  if (
    action === 'upgrade-subscription' ||
    action === 'cancel-subscription' ||
    action === 'restore-subscription'
  ) {
    // Should verify user is organization owner
    // This is a simplified check - implement proper DB query in production
    return true;
  }

  return true;
}

/**
 * Create the Stripe plugin configuration
 */
export function createStripePlugin(config: StripePluginConfig = {}) {
  const env = getAuthEnv();

  const {
    secretKey = env.STRIPE_SECRET_KEY,
    webhookSecret = env.STRIPE_WEBHOOK_SECRET,
    createCustomerOnSignUp = true,
    subscription = {},
    onEvent,
    onCustomerCreate,
  } = config;

  // If Stripe is not configured, return empty plugin
  if (!secretKey || !webhookSecret) {
    console.warn('[Stripe] Stripe not configured - plugin disabled');
    return [];
  }

  const {
    enabled = true,
    getCheckoutSessionParams = defaultGetCheckoutSessionParams,
    plans = defaultGetPlans,
    authorizeReference = defaultAuthorizeReference,
    onSubscriptionComplete,
    onSubscriptionUpdate,
    onSubscriptionCancel,
    onSubscriptionDeleted,
  } = subscription;

  return [
    {
      id: 'stripe',
      secretKey,
      webhookSecret,
      createCustomerOnSignUp,

      subscription: enabled
        ? {
            enabled: true,
            getCheckoutSessionParams,
            plans,
            authorizeReference,
            onSubscriptionComplete,
            onSubscriptionUpdate,
            onSubscriptionCancel,
            onSubscriptionDeleted,
          }
        : undefined,

      onEvent: async (event: StripeEvent) => {
        console.log(`[Stripe] Received event: ${event.type}`);

        // Handle product and price events
        switch (event.type) {
          case 'product.created':
          case 'product.updated':
            console.log(`[Stripe] Product created/updated: ${event.data.object.id}`);
            break;
          case 'product.deleted':
            console.log(`[Stripe] Product deleted: ${event.data.object.id}`);
            break;
          case 'price.created':
          case 'price.updated':
            console.log(`[Stripe] Price created/updated: ${event.data.object.id}`);
            break;
          case 'price.deleted':
            console.log(`[Stripe] Price deleted: ${event.data.object.id}`);
            break;
        }

        // Call custom event handler if provided
        if (onEvent) {
          await onEvent(event);
        }
      },

      onCustomerCreate: async (params: CustomerCreateParams) => {
        console.log(`[Stripe] Customer created: ${params.stripeCustomer.id} for user ${params.user.id}`);

        if (onCustomerCreate) {
          await onCustomerCreate(params);
        }
      },
    },
  ];
}

/**
 * Pre-configured Stripe plugin (returns empty array if not configured)
 */
export const stripePlugin = isStripeConfigured() ? createStripePlugin() : [];

/**
 * Verify Stripe webhook signature
 */
export async function verifyStripeWebhook(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Promise<StripeEvent | null> {
  try {
    // In production, use the Stripe SDK to verify
    // This is a placeholder that should use stripe.webhooks.constructEvent
    console.log('[Stripe] Verifying webhook signature...');

    // For now, parse the payload directly (NOT SECURE - use Stripe SDK in production)
    const event = JSON.parse(typeof payload === 'string' ? payload : payload.toString()) as StripeEvent;

    return event;
  } catch (error) {
    console.error('[Stripe] Webhook verification failed:', error);
    return null;
  }
}

/**
 * Create a checkout session URL
 */
export async function createCheckoutSession(params: {
  priceId: string;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string } | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    // This should call the main site's checkout API
    const response = await fetch(`${mainSiteUrl}/api/stripe/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error('[Stripe] Failed to create checkout session:', await response.text());
      return null;
    }

    return (await response.json()) as { url: string };
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    return null;
  }
}

/**
 * Create a customer portal session URL
 */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string } | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/stripe/create-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error('[Stripe] Failed to create portal session:', await response.text());
      return null;
    }

    return (await response.json()) as { url: string };
  } catch (error) {
    console.error('[Stripe] Error creating portal session:', error);
    return null;
  }
}

/**
 * Parse billing interval from subscription period
 */
export function parseBillingInterval(periodStart: Date, periodEnd: Date): 'month' | 'year' {
  const durationMs = periodEnd.getTime() - periodStart.getTime();
  const monthsInPeriod = Math.floor(durationMs / (1000 * 60 * 60 * 24 * 30.44));
  return monthsInPeriod >= 11 ? 'year' : 'month';
}

/**
 * Parse custom limits from plan object
 */
export function parseCustomLimits(plan: StripePlan): Partial<PlanLimits> | undefined {
  if (!plan.limits) {
    return undefined;
  }

  const limits: Partial<PlanLimits> = {};

  if (plan.limits['ai_nums'] !== undefined) {
    limits.aiNums = Number(plan.limits['ai_nums']);
  }
  if (plan.limits['seats'] !== undefined) {
    limits.seats = Number(plan.limits['seats']);
  }
  if (plan.limits['project_nums'] !== undefined) {
    limits.projectNums = Number(plan.limits['project_nums']);
  }

  return Object.keys(limits).length > 0 ? limits : undefined;
}
