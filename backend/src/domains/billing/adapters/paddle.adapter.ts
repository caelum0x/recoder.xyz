/**
 * `createPaddleAdapter` — the Paddle (Billing / v2 API) implementation of
 * {@link BillingProviderPort}.
 *
 * Paddle is a Merchant-of-Record: a hosted checkout is opened against a
 * `transaction` (its price ids are the per-tier products in the plan map), and
 * the subscription lifecycle arrives as `Paddle-Signature`-signed webhooks
 * (`ts=<unix>;h1=<hex>`, HMAC-SHA256 of `${ts}:${rawBody}`).
 *
 * Degrade-safe: absent key ⇒ checkout throws `SERVICE_UNAVAILABLE`, reads return
 * `null`, `verifyWebhook` is `false`, and `health()` is `down` with a reason.
 */
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type {
  CancelOptions,
  CheckoutIntent,
  CheckoutResult,
  MeterEvent,
  ParsedWebhook,
  PlanTier,
  ProviderHealth,
  ProviderSubscription,
} from '../types.js';
import {
  buildProviderHealth,
  createProviderTransport,
  isoOrUndefined,
  normalizeStatus,
  resolveBaseUrl,
  str,
  subjectIdFromMetadata,
  unconfiguredCheckoutError,
  verifyPaddleSignature,
  type ProviderAdapterDeps,
} from './shared.js';

const DEFAULT_BASE_URL = 'https://api.paddle.com';

interface PaddleSubscription {
  id?: string;
  status?: string;
  customer_id?: string;
  current_billing_period?: { ends_at?: string } | null;
  scheduled_change?: { action?: string } | null;
  items?: Array<{ price?: { product_id?: string; id?: string } }>;
  custom_data?: Record<string, unknown>;
}

function productIdOf(raw: PaddleSubscription): string | undefined {
  const first = raw.items?.[0]?.price;
  return str(first?.id) ?? str(first?.product_id);
}

function toProviderSubscription(
  raw: PaddleSubscription,
  planFor: (productId: string) => PlanTier | undefined,
): ProviderSubscription | undefined {
  const providerSubId = str(raw.id);
  if (!providerSubId) return undefined;
  const productId = productIdOf(raw);
  return {
    provider: 'paddle',
    providerSubId,
    providerCustomerId: str(raw.customer_id),
    status: normalizeStatus(raw.status),
    plan: productId ? planFor(productId) : undefined,
    currentPeriodEnd: isoOrUndefined(raw.current_billing_period?.ends_at),
    cancelAtPeriodEnd: raw.scheduled_change?.action === 'cancel',
  };
}

function normalizeEventType(type: string): string {
  switch (type) {
    case 'subscription.activated':
    case 'subscription.created':
    case 'subscription.resumed':
      return 'subscription.active';
    case 'subscription.trialing':
      return 'subscription.trialing';
    case 'subscription.updated':
      return 'subscription.updated';
    case 'subscription.canceled':
    case 'subscription.paused':
      return 'subscription.canceled';
    case 'subscription.past_due':
      return 'subscription.past_due';
    case 'transaction.paid':
    case 'transaction.completed':
      return 'invoice.paid';
    default:
      return `paddle.${type}`;
  }
}

export function createPaddleAdapter(deps: ProviderAdapterDeps): BillingProviderPort {
  const { credential, catalog, logger } = deps;
  const baseUrl = resolveBaseUrl(credential, DEFAULT_BASE_URL);
  const planFor = (productId: string) => catalog.planForProduct(productId, 'paddle');

  const { call } = createProviderTransport({
    provider: 'paddle',
    baseUrl,
    apiKey: credential.apiKey ?? '',
    resilience: deps.resilience,
    tracer: deps.tracer,
  });

  return {
    name: 'paddle',

    async createCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
      if (!credential.present) throw unconfiguredCheckoutError('paddle');
      const body: Record<string, unknown> = {
        items: [{ price_id: intent.productId, quantity: 1 }],
        ...(intent.customerEmail ? { customer: { email: intent.customerEmail } } : {}),
        custom_data: {
          ...(intent.metadata ?? {}),
          subject_id: intent.subject.subjectId,
          subject_kind: intent.subject.kind,
          plan: intent.plan,
        },
        checkout: { url: intent.successUrl },
      };
      const result = await call<{ data?: { id?: string; checkout?: { url?: string } } }>(
        'POST',
        '/transactions',
        body,
      );
      const url = str(result.data?.checkout?.url);
      const checkoutId = str(result.data?.id);
      if (!url || !checkoutId) throw unconfiguredCheckoutError('paddle');
      return { provider: 'paddle', checkoutId, url };
    },

    async getSubscription(providerSubId: string): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const result = await call<{ data?: PaddleSubscription }>(
          'GET',
          `/subscriptions/${encodeURIComponent(providerSubId)}`,
        );
        return result.data ? toProviderSubscription(result.data, planFor) ?? null : null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'paddle.getSubscription failed → null (fail safe)');
        return null;
      }
    },

    async cancel(providerSubId: string, opts?: CancelOptions): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const result = await call<{ data?: PaddleSubscription }>(
          'POST',
          `/subscriptions/${encodeURIComponent(providerSubId)}/cancel`,
          { effective_from: opts?.atPeriodEnd ? 'next_billing_period' : 'immediately' },
        );
        return result.data ? toProviderSubscription(result.data, planFor) ?? null : null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'paddle.cancel failed → null (fail safe)');
        return null;
      }
    },

    verifyWebhook(rawBody: Buffer, headers: Readonly<Record<string, string>>): boolean {
      if (!credential.webhookSecretPresent || !credential.webhookSecret) return false;
      return verifyPaddleSignature(rawBody, headers, credential.webhookSecret);
    },

    parseEvent(rawBody: Buffer, headers: Readonly<Record<string, string>>): ParsedWebhook | null {
      if (!this.verifyWebhook(rawBody, headers)) return null;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      const type = str(payload.event_type) ?? 'unknown';
      const data = (payload.data ?? {}) as PaddleSubscription;
      const eventId = str(payload.event_id) ?? str(payload.notification_id) ?? `paddle_${Date.now()}`;
      const subscription = toProviderSubscription(data, planFor);
      return {
        provider: 'paddle',
        eventId,
        type: normalizeEventType(type),
        subjectId: subjectIdFromMetadata(data.custom_data) ?? subscription?.providerCustomerId,
        ...(subscription ? { subscription } : {}),
        raw: payload,
      };
    },

    async emitUsage(_events: readonly MeterEvent[]): Promise<void> {
      // Paddle metered billing is driven by transaction line items, not a raw
      // event feed — no generic usage-ingest endpoint. No-op (degrade-safe).
      return;
    },

    async health(): Promise<ProviderHealth> {
      return buildProviderHealth('paddle', credential, async () => {
        await call('GET', '/prices?per_page=1');
      });
    },
  };
}
