/**
 * `createPolarAdapter` — the Polar (polarsource/polar, Apache-2.0) implementation
 * of {@link BillingProviderPort}.
 *
 * Polar is a Merchant-of-Record: hosted checkout + Standard-Webhooks-signed
 * subscription lifecycle. This adapter reuses the plain-HTTP shape proven in
 * `backend/src/engines/polar-client.ts` (no SDK version coupling; works against
 * managed / sandbox / self-hosted via the injected `baseUrl`) but takes its
 * credential from the injected `BillingConfig` slice instead of `process.env`,
 * per ARCHITECTURE §10.8.
 *
 * Degrade-safe: with no `POLAR_ACCESS_TOKEN` it never hits the network — checkout
 * throws `SERVICE_UNAVAILABLE`, reads return `null`, `verifyWebhook` is `false`,
 * and `health()` reports `down` with a truthful reason.
 */
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type {
  CancelOptions,
  CheckoutIntent,
  CheckoutResult,
  MeterEvent,
  ParsedWebhook,
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
  verifyStandardWebhook,
  type ProviderAdapterDeps,
} from './shared.js';

const DEFAULT_BASE_URL = 'https://api.polar.sh';

interface PolarSubscription {
  id?: string;
  status?: string;
  customer_id?: string;
  product_id?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, unknown>;
}

/** Normalize event/read `subscription` JSON → the domain {@link ProviderSubscription}. */
function toProviderSubscription(
  raw: PolarSubscription,
  planFor: (productId: string) => import('../types.js').PlanTier | undefined,
): ProviderSubscription | undefined {
  const providerSubId = str(raw.id);
  if (!providerSubId) return undefined;
  const productId = str(raw.product_id);
  return {
    provider: 'polar',
    providerSubId,
    providerCustomerId: str(raw.customer_id),
    status: normalizeStatus(raw.status),
    plan: productId ? planFor(productId) : undefined,
    currentPeriodEnd: isoOrUndefined(raw.current_period_end),
    cancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
  };
}

/** Map a Polar event type onto the normalized reconcile vocabulary. */
function normalizeEventType(type: string): string {
  switch (type) {
    case 'subscription.active':
    case 'subscription.created':
      return 'subscription.active';
    case 'subscription.updated':
      return 'subscription.updated';
    case 'subscription.canceled':
    case 'subscription.revoked':
      return 'subscription.canceled';
    case 'subscription.uncanceled':
      return 'subscription.updated';
    case 'order.paid':
    case 'invoice.paid':
      return 'invoice.paid';
    default:
      return `polar.${type}`;
  }
}

export function createPolarAdapter(deps: ProviderAdapterDeps): BillingProviderPort {
  const { credential, catalog, logger } = deps;
  const baseUrl = resolveBaseUrl(credential, DEFAULT_BASE_URL);
  const planFor = (productId: string) => catalog.planForProduct(productId, 'polar');

  const { call } = createProviderTransport({
    provider: 'polar',
    baseUrl,
    apiKey: credential.apiKey ?? '',
    resilience: deps.resilience,
  });

  return {
    name: 'polar',

    async createCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
      if (!credential.present) throw unconfiguredCheckoutError('polar');
      const body: Record<string, unknown> = {
        products: [intent.productId],
        success_url: intent.successUrl,
        ...(intent.customerEmail ? { customer_email: intent.customerEmail } : {}),
        metadata: {
          ...(intent.metadata ?? {}),
          subject_id: intent.subject.subjectId,
          subject_kind: intent.subject.kind,
          plan: intent.plan,
        },
        ...(credential.organizationId ? { organization_id: credential.organizationId } : {}),
      };
      const result = await call<{ id?: string; url?: string }>('POST', '/v1/checkouts/', body);
      const url = str(result.url);
      const checkoutId = str(result.id);
      if (!url || !checkoutId) {
        throw unconfiguredCheckoutError('polar');
      }
      return { provider: 'polar', checkoutId, url };
    },

    async getSubscription(providerSubId: string): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const raw = await call<PolarSubscription>(
          'GET',
          `/v1/subscriptions/${encodeURIComponent(providerSubId)}`,
        );
        return toProviderSubscription(raw, planFor) ?? null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'polar.getSubscription failed → null (fail safe)');
        return null;
      }
    },

    async cancel(providerSubId: string, opts?: CancelOptions): Promise<ProviderSubscription | null> {
      if (!credential.present) return null;
      try {
        const body = opts?.atPeriodEnd ? { cancel_at_period_end: true } : { revoke: true };
        const raw = await call<PolarSubscription>(
          'PATCH',
          `/v1/subscriptions/${encodeURIComponent(providerSubId)}`,
          body,
        );
        return toProviderSubscription(raw, planFor) ?? null;
      } catch (error) {
        logger?.warn?.({ error, providerSubId }, 'polar.cancel failed → null (fail safe)');
        return null;
      }
    },

    verifyWebhook(rawBody: Buffer, headers: Readonly<Record<string, string>>): boolean {
      if (!credential.webhookSecretPresent || !credential.webhookSecret) return false;
      return verifyStandardWebhook(rawBody, headers, credential.webhookSecret);
    },

    parseEvent(rawBody: Buffer, headers: Readonly<Record<string, string>>): ParsedWebhook | null {
      if (!this.verifyWebhook(rawBody, headers)) return null;
      const payload = (() => {
        try {
          return JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })();
      const type = str(payload.type) ?? 'unknown';
      const data = (payload.data ?? {}) as PolarSubscription;
      const eventId =
        str((headers as Record<string, string>)['webhook-id']) ?? str(payload.id) ?? `polar_${Date.now()}`;
      const subscription = toProviderSubscription(data, planFor);
      return {
        provider: 'polar',
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
        await call('POST', '/v1/events/ingest', {
          events: events.map((e) => ({
            name: e.kind,
            external_customer_id: e.subjectId,
            timestamp: e.timestamp,
            metadata: { quantity: e.quantity, idempotency_key: e.idempotencyKey },
          })),
        });
      } catch (error) {
        logger?.warn?.({ error, count: events.length }, 'polar.emitUsage failed → retained for retry');
        throw error;
      }
    },

    async health(): Promise<ProviderHealth> {
      return buildProviderHealth('polar', credential, async () => {
        await call('GET', '/v1/products/?limit=1');
      });
    },
  };
}
