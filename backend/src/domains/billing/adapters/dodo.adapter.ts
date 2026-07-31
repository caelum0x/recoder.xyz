/**
 * `createDodoAdapter` — the Dodo Payments (dodopayments.com) implementation of
 * {@link BillingProviderPort}.
 *
 * Dodo Payments is a Merchant-of-Record for global digital sales: a subscription
 * is created with a hosted `payment_link`, and lifecycle events arrive as
 * Standard-Webhooks-signed payloads (same `webhook-id`/`webhook-timestamp`/
 * `webhook-signature` scheme as Polar). Bearer-authenticated REST.
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
  isoOrUndefined,
  normalizeStatus,
  providerFetch,
  resolveBaseUrl,
  str,
  subjectIdFromMetadata,
  unconfiguredCheckoutError,
  verifyStandardWebhook,
  type ProviderAdapterDeps,
} from './shared.js';

const DEFAULT_BASE_URL = 'https://live.dodopayments.com';

interface DodoSubscription {
  subscription_id?: string;
  status?: string;
  product_id?: string;
  next_billing_date?: string;
  cancel_at_next_billing_date?: boolean;
  customer?: { customer_id?: string } | string;
  metadata?: Record<string, unknown>;
}

function customerIdOf(v: DodoSubscription['customer']): string | undefined {
  if (v == null) return undefined;
  return typeof v === 'string' ? str(v) : str(v.customer_id);
}

function toProviderSubscription(
  raw: DodoSubscription,
  planFor: (productId: string) => PlanTier | undefined,
): ProviderSubscription | undefined {
  const providerSubId = str(raw.subscription_id);
  if (!providerSubId) return undefined;
  const productId = str(raw.product_id);
  return {
    provider: 'dodo',
    providerSubId,
    providerCustomerId: customerIdOf(raw.customer),
    status: normalizeStatus(raw.status),
    plan: productId ? planFor(productId) : undefined,
    currentPeriodEnd: isoOrUndefined(raw.next_billing_date),
    cancelAtPeriodEnd: Boolean(raw.cancel_at_next_billing_date),
  };
}

function normalizeEventType(type: string): string {
  switch (type) {
    case 'subscription.active':
    case 'subscription.renewed':
      return 'subscription.active';
    case 'subscription.on_hold':
    case 'subscription.failed':
      return 'subscription.past_due';
    case 'subscription.updated':
    case 'subscription.plan_changed':
      return 'subscription.updated';
    case 'subscription.cancelled':
    case 'subscription.canceled':
    case 'subscription.expired':
      return 'subscription.canceled';
    case 'payment.succeeded':
      return 'invoice.paid';
    default:
      return `dodo.${type}`;
  }
}

export function createDodoAdapter(deps: ProviderAdapterDeps): BillingProviderPort {
  const { credential, catalog, logger } = deps;
  const baseUrl = resolveBaseUrl(credential, DEFAULT_BASE_URL);
  const planFor = (productId: string) => catalog.planForProduct(productId, 'dodo');

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return providerFetch<T>({ baseUrl, apiKey: credential.apiKey ?? '', method, path, body });
  }

  return {
    name: 'dodo',

    async createCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
      if (!credential.present) throw unconfiguredCheckoutError('dodo');
      const body: Record<string, unknown> = {
        product_id: intent.productId,
        payment_link: true,
        return_url: intent.successUrl,
        quantity: 1,
        ...(intent.customerEmail ? { customer: { email: intent.customerEmail } } : {}),
        metadata: {
          ...(intent.metadata ?? {}),
          subject_id: intent.subject.subjectId,
          subject_kind: intent.subject.kind,
          plan: intent.plan,
        },
      };
      const result = await call<{ subscription_id?: string; payment_link?: string }>(
        'POST',
        '/subscriptions',
        body,
      );
      const url = str(result.payment_link);
      const checkoutId = str(result.subscription_id);
      if (!url || !checkoutId) throw unconfiguredCheckoutError('dodo');
      return { provider: 'dodo', checkoutId, url };
    },

    async getSubscription(providerSubId: string): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const raw = await call<DodoSubscription>(
          'GET',
          `/subscriptions/${encodeURIComponent(providerSubId)}`,
        );
        return toProviderSubscription(raw, planFor) ?? null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'dodo.getSubscription failed → null (fail safe)');
        return null;
      }
    },

    async cancel(providerSubId: string, opts?: CancelOptions): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const body = opts?.atPeriodEnd
          ? { cancel_at_next_billing_date: true }
          : { status: 'cancelled' };
        const raw = await call<DodoSubscription>(
          'PATCH',
          `/subscriptions/${encodeURIComponent(providerSubId)}`,
          body,
        );
        return toProviderSubscription(raw, planFor) ?? null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'dodo.cancel failed → null (fail safe)');
        return null;
      }
    },

    verifyWebhook(rawBody: Buffer, headers: Readonly<Record<string, string>>): boolean {
      if (!credential.webhookSecretPresent || !credential.webhookSecret) return false;
      return verifyStandardWebhook(rawBody, headers, credential.webhookSecret);
    },

    parseEvent(rawBody: Buffer, headers: Readonly<Record<string, string>>): ParsedWebhook | null {
      if (!this.verifyWebhook(rawBody, headers)) return null;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      const type = str(payload.type) ?? 'unknown';
      const data = (payload.data ?? {}) as DodoSubscription;
      const eventId =
        str((headers as Record<string, string>)['webhook-id']) ??
        str(payload.business_id) ??
        `dodo_${Date.now()}`;
      const subscription = toProviderSubscription(data, planFor);
      return {
        provider: 'dodo',
        eventId,
        type: normalizeEventType(type),
        subjectId: subjectIdFromMetadata(data.metadata) ?? subscription?.providerCustomerId,
        ...(subscription ? { subscription } : {}),
        raw: payload,
      };
    },

    async emitUsage(events: readonly MeterEvent[]): Promise<void> {
      // Pre-flight no-op guards: no credential or an empty batch never touches
      // the network and never throws (nothing to flush).
      if (!credential.present || events.length === 0) return;
      // A push failure MUST propagate: metering.flushOnce relies on this throw to
      // leave the batch unflushed (never `markFlushed`) so usage is not silently
      // dropped and the customer under-charged (billing-provider.port.ts §74-76).
      try {
        await call('POST', '/usage-events/ingest', {
          events: events.map((e) => ({
            event_id: e.idempotencyKey,
            customer_id: e.subjectId,
            event_name: e.kind,
            timestamp: e.timestamp,
            metadata: { quantity: e.quantity },
          })),
        });
      } catch (error) {
        logger?.warn?.({ error, count: events.length }, 'dodo.emitUsage failed → retained for retry');
        throw error;
      }
    },

    async health(): Promise<ProviderHealth> {
      return buildProviderHealth('dodo', credential, async () => {
        await call('GET', '/products?page_size=1');
      });
    },
  };
}
