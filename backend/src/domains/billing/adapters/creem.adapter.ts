/**
 * `createCreemAdapter` — the Creem (creem.io) implementation of
 * {@link BillingProviderPort}.
 *
 * Creem is a Merchant-of-Record for digital goods: hosted checkout + webhook-
 * driven subscription lifecycle. It authenticates with an `x-api-key` header and
 * signs webhooks with a hex HMAC-SHA256 of the raw body in the `creem-signature`
 * header.
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
  verifyHmacHex,
  type ProviderAdapterDeps,
} from './shared.js';

const DEFAULT_BASE_URL = 'https://api.creem.io';

interface CreemSubscription {
  id?: string;
  status?: string;
  customer?: { id?: string } | string;
  product?: { id?: string } | string;
  current_period_end_date?: string;
  canceled_at?: string | null;
  metadata?: Record<string, unknown>;
}

function idOf(v: { id?: string } | string | undefined): string | undefined {
  if (v == null) return undefined;
  return typeof v === 'string' ? str(v) : str(v.id);
}

function toProviderSubscription(
  raw: CreemSubscription,
  planFor: (productId: string) => PlanTier | undefined,
): ProviderSubscription | undefined {
  const providerSubId = str(raw.id);
  if (!providerSubId) return undefined;
  const productId = idOf(raw.product);
  return {
    provider: 'creem',
    providerSubId,
    providerCustomerId: idOf(raw.customer),
    status: normalizeStatus(raw.status),
    plan: productId ? planFor(productId) : undefined,
    currentPeriodEnd: isoOrUndefined(raw.current_period_end_date),
    cancelAtPeriodEnd: Boolean(raw.canceled_at),
  };
}

function normalizeEventType(type: string): string {
  switch (type) {
    case 'subscription.active':
    case 'subscription.paid':
      return 'subscription.active';
    case 'subscription.trialing':
      return 'subscription.trialing';
    case 'subscription.update':
    case 'subscription.updated':
      return 'subscription.updated';
    case 'subscription.canceled':
    case 'subscription.cancelled':
    case 'subscription.expired':
      return 'subscription.canceled';
    case 'subscription.past_due':
      return 'subscription.past_due';
    default:
      return `creem.${type}`;
  }
}

export function createCreemAdapter(deps: ProviderAdapterDeps): BillingProviderPort {
  const { credential, catalog, logger } = deps;
  const baseUrl = resolveBaseUrl(credential, DEFAULT_BASE_URL);
  const planFor = (productId: string) => catalog.planForProduct(productId, 'creem');

  const { call } = createProviderTransport({
    provider: 'creem',
    baseUrl,
    apiKey: credential.apiKey ?? '',
    authScheme: 'x-api-key',
    resilience: deps.resilience,
    tracer: deps.tracer,
  });

  return {
    name: 'creem',

    async createCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
      if (!credential.present) throw unconfiguredCheckoutError('creem');
      const body: Record<string, unknown> = {
        product_id: intent.productId,
        success_url: intent.successUrl,
        ...(intent.customerEmail ? { customer: { email: intent.customerEmail } } : {}),
        metadata: {
          ...(intent.metadata ?? {}),
          subject_id: intent.subject.subjectId,
          subject_kind: intent.subject.kind,
          plan: intent.plan,
        },
      };
      const result = await call<{ id?: string; checkout_url?: string }>('POST', '/v1/checkouts', body);
      const url = str(result.checkout_url);
      const checkoutId = str(result.id);
      if (!url || !checkoutId) throw unconfiguredCheckoutError('creem');
      return { provider: 'creem', checkoutId, url };
    },

    async getSubscription(providerSubId: string): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const raw = await call<CreemSubscription>(
          'GET',
          `/v1/subscriptions?subscription_id=${encodeURIComponent(providerSubId)}`,
        );
        return toProviderSubscription(raw, planFor) ?? null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'creem.getSubscription failed → null (fail safe)');
        return null;
      }
    },

    async cancel(providerSubId: string, opts?: CancelOptions): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const raw = await call<CreemSubscription>(
          'POST',
          `/v1/subscriptions/${encodeURIComponent(providerSubId)}/cancel`,
          { cancel_at_period_end: opts?.atPeriodEnd === true },
        );
        return toProviderSubscription(raw, planFor) ?? null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'creem.cancel failed → null (fail safe)');
        return null;
      }
    },

    verifyWebhook(rawBody: Buffer, headers: Readonly<Record<string, string>>): boolean {
      if (!credential.webhookSecretPresent || !credential.webhookSecret) return false;
      return verifyHmacHex(rawBody, headers, credential.webhookSecret, 'creem-signature');
    },

    parseEvent(rawBody: Buffer, headers: Readonly<Record<string, string>>): ParsedWebhook | null {
      if (!this.verifyWebhook(rawBody, headers)) return null;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      const type = str(payload.eventType) ?? str(payload.type) ?? 'unknown';
      const data = (payload.object ?? payload.data ?? {}) as CreemSubscription;
      const eventId = str(payload.id) ?? `creem_${Date.now()}`;
      const subscription = toProviderSubscription(data, planFor);
      return {
        provider: 'creem',
        eventId,
        type: normalizeEventType(type),
        subjectId: subjectIdFromMetadata(data.metadata) ?? subscription?.providerCustomerId,
        ...(subscription ? { subscription } : {}),
        raw: payload,
      };
    },

    async emitUsage(_events: readonly MeterEvent[]): Promise<void> {
      // Creem has no first-class usage-meter ingestion API — no-op (degrade-safe).
      return;
    },

    async health(): Promise<ProviderHealth> {
      return buildProviderHealth('creem', credential, async () => {
        await call('GET', '/v1/products/search?page_size=1');
      });
    },
  };
}
