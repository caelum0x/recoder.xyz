/**
 * Payment Provider Abstraction Types
 *
 * Shared interfaces for all payment providers (Polar.sh, DodoPayments, etc.).
 * When no provider is configured the billing system operates in "free mode"
 * (credits managed manually in the DB).
 */

export interface CheckoutSessionParams {
  /** Internal plan identifier (e.g. "pro", "monthly") */
  planId: string;
  /** Platform user ID */
  userId: string;
  /** User email (required by some providers for customer creation) */
  userEmail: string;
  /** User display name */
  userName?: string;
  /** URL the customer returns to on success */
  successUrl: string;
  /** URL the customer returns to on cancel */
  cancelUrl: string;
  /** Optional trial period in days */
  trialDays?: number;
}

export interface CheckoutSessionResult {
  /** Provider-assigned session or checkout ID */
  sessionId: string;
  /** URL to redirect the customer to */
  checkoutUrl: string;
  /** Provider name (e.g. "polar", "dodo") */
  provider: string;
}

export interface SubscriptionInfo {
  /** Provider-assigned subscription ID */
  id: string;
  /** Current status */
  status: 'active' | 'cancelled' | 'past_due' | 'on_hold' | 'trialing' | 'expired' | 'pending';
  /** Plan / product identifier on the provider side */
  planId: string;
  /** Provider name */
  provider: string;
  /** Current billing period start (ISO string) */
  currentPeriodStart?: string;
  /** Current billing period end (ISO string) */
  currentPeriodEnd?: string;
  /** Whether the subscription will cancel at period end */
  cancelAtPeriodEnd?: boolean;
}

export interface WebhookEvent {
  /** Normalised event type */
  type:
    | 'subscription.created'
    | 'subscription.updated'
    | 'subscription.cancelled'
    | 'subscription.renewed'
    | 'payment.succeeded'
    | 'payment.failed'
    | 'refund.created'
    | 'unknown';
  /** Provider name */
  provider: string;
  /** Raw provider payload (provider-specific shape) */
  rawPayload: any;
  /** Extracted user identifier (platform user ID or email) */
  userId?: string;
  /** Extracted plan/product identifier */
  planId?: string;
  /** Extracted subscription ID on the provider side */
  subscriptionId?: string;
  /** Payment amount in cents */
  amount?: number;
  /** Currency code */
  currency?: string;
}

export interface PaymentProvider {
  /** Human-readable provider name */
  readonly name: string;

  /**
   * Create a hosted checkout session.
   * The caller should redirect the customer to `checkoutUrl`.
   */
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;

  /**
   * Retrieve subscription details from the provider.
   */
  getSubscription(providerSubscriptionId: string): Promise<SubscriptionInfo>;

  /**
   * Request cancellation of a subscription.
   * @param atPeriodEnd If true, cancel at end of current billing cycle.
   */
  cancelSubscription(providerSubscriptionId: string, atPeriodEnd?: boolean): Promise<void>;

  /**
   * Verify an incoming webhook signature and parse the payload into a
   * normalised `WebhookEvent`.
   *
   * Returns `null` if the signature is invalid.
   */
  verifyAndParseWebhook(rawBody: string, signature: string): Promise<WebhookEvent | null>;
}
