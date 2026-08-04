/**
 * PaymentProvider — provider-agnostic billing contract (NEXT-PHASES C6).
 *
 * Every provider (Creem, Dodo, Paddle, ...) is adapted to this surface so
 * routes and services never depend on a vendor SDK shape. Methods never throw
 * for configuration problems: a missing key yields a degraded provider whose
 * methods return `{ ok: false, reason }` (repo billing law: fail safe, never
 * fake success, never crash at import).
 */

export type NormalizedWebhookEventType =
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'payment.succeeded'
  | 'payment.failed';

export interface NormalizedWebhookEvent {
  type: NormalizedWebhookEventType;
  /** Provider-side subscription id (subscriptions.providerId). */
  subscriptionId: string;
  /** Our users.id, when the provider echoes back checkout metadata. */
  userId?: string;
  /** Our pricing-config plan id, when resolvable. */
  planId?: string;
  /** Provider-reported status string, passed through untranslated. */
  status?: string;
  /**
   * Checkout metadata as the normalizer extracted it (envelope-agnostic:
   * `object`/`data`, nested subscription merged) — consumers must read THIS,
   * not re-walk `raw`, or the envelope handling diverges.
   */
  metadata?: Record<string, unknown>;
  /** Full parsed provider payload for auditing/forward-compat. */
  raw: unknown;
}

export interface ProviderFailure {
  ok: false;
  reason: string;
}

// Flat unions (no generic intersection on the success arm) so `result.ok`
// discriminant narrowing works under this repo's non-strict tsconfig.
export type CheckoutResult =
  | { ok: true; checkoutUrl: string; id: string }
  | ProviderFailure;

export type SubscriptionResult =
  | { ok: true; subscription: ProviderSubscription }
  | ProviderFailure;

export type CancelResult = { ok: true; status: string } | ProviderFailure;

export type WebhookVerifyResult =
  | { ok: true; event: NormalizedWebhookEvent }
  | ProviderFailure;

export interface CheckoutInput {
  userId: string;
  email: string;
  planId: string;
  amount: number;
  currency: string;
  interval: string;
}

export interface ProviderSubscription {
  id: string;
  status: string;
  planId?: string;
  currentPeriodEnd?: Date;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when required env keys are missing — callers must degrade truthfully. */
  readonly configured: boolean;

  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  getSubscription(id: string): Promise<SubscriptionResult>;

  cancelSubscription(id: string): Promise<CancelResult>;

  changePlan(id: string, newPlanId: string): Promise<SubscriptionResult>;

  /**
   * Verify the raw webhook body against the provider signature and normalize
   * the event. Sync because verification is pure HMAC + parse.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookVerifyResult;
}

/**
 * Shared degraded implementation: every method reports the same truthful
 * reason and nothing throws.
 */
export function degradedProvider(name: string, reason: string): PaymentProvider {
  const failure: ProviderFailure = { ok: false, reason };
  return {
    name,
    configured: false,
    createCheckout: async () => failure,
    getSubscription: async () => failure,
    cancelSubscription: async () => failure,
    changePlan: async () => failure,
    verifyWebhook: () => failure,
  };
}
