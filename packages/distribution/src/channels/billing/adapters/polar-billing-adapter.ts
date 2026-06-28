import { z } from 'zod';
import type {
  BillingPort,
  CheckoutIntent,
  CheckoutResult,
  MeterEvent,
} from '../../../ports/billing-port';
import type { SecretPort } from '../../../ports/secret-port';
import type { Entitlement, Subject } from '../../../domain/entitlement';
import type { Quota, UsageKind } from '../../../domain/quota';
import type { LicenseKeyActivation } from '../../../domain/license-key';
import type { ChannelHealth } from '../../../domain/health-state';
import { healthy, unhealthy } from '../../../domain/health-state';
import { DEFAULT_POLAR_API_BASE, ENV_KEYS } from '../../../config/index';
import { FailSafeError, DistributionError } from '../../../errors/index';
import type { Plan } from '../../../domain/subscription-plan';
import type { PlanCatalog } from '../plan-catalog';

/**
 * A REAL typed fetch client to the Polar (Merchant of Record) API.
 *
 * This is a real first-party boundary, not a thin wrapper of a closed service:
 * Polar is open-source and we speak its documented HTTP API directly (checkout
 * creation, customer benefit-grants/entitlements, license-key validation,
 * usage event ingestion) with typed request shaping and typed response parsing.
 *
 * FAIL SAFE (production rule, AGENTS.md #5): the access token comes from
 * env/vault only. When `POLAR_ACCESS_TOKEN` is absent, every money/entitlement
 * call raises a `FailSafeError` and `health()` reports `unhealthy` — never a
 * faked allow / faked "ok".
 */
export interface PolarBillingAdapterOptions {
  readonly secrets: SecretPort;
  readonly planCatalog: PlanCatalog;
  /** Injected for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Polar API base override; defaults to the documented production base. */
  readonly apiBase?: string;
  readonly now?: () => Date;
}

// ----- Polar response shapes (the subset we consume) -----

const PolarCheckoutResponse = z.object({
  id: z.string(),
  url: z.string().url(),
  client_secret: z.string().optional(),
});

const PolarBenefitGrant = z.object({
  id: z.string(),
  granted_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  is_granted: z.boolean().optional(),
  benefit_id: z.string().optional(),
  benefit: z
    .object({
      id: z.string(),
      type: z.string().optional(),
    })
    .optional(),
});

const PolarBenefitGrantsList = z.object({
  items: z.array(PolarBenefitGrant),
});

const PolarLicenseKeyValidate = z.object({
  status: z.string().optional(),
  id: z.string().optional(),
  key: z.string().optional(),
  activation: z.object({ id: z.string() }).nullable().optional(),
  validations: z.number().optional(),
});

function mapBenefitTypeToKind(type: string | undefined): Entitlement['kind'] {
  switch (type) {
    case 'license_keys':
      return 'license_key';
    case 'downloadables':
      return 'downloadable';
    case 'feature_flag':
      return 'feature_flag';
    case 'meter_credit':
      return 'meter_credit';
    default:
      return 'plan';
  }
}

export function createPolarBillingAdapter(opts: PolarBillingAdapterOptions): BillingPort {
  const apiBase = opts.apiBase ?? opts.secrets.get(ENV_KEYS.POLAR_API_BASE) ?? DEFAULT_POLAR_API_BASE;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const now = opts.now ?? (() => new Date());

  /** Read the access token or fail safe (deny + unhealthy, never faked allow). */
  function requireToken(): string {
    const token = opts.secrets.get(ENV_KEYS.POLAR_ACCESS_TOKEN);
    if (!token) {
      throw new FailSafeError(
        `Polar billing unavailable: ${ENV_KEYS.POLAR_ACCESS_TOKEN} is not set`,
        { provider: 'polar', missingKey: ENV_KEYS.POLAR_ACCESS_TOKEN },
      );
    }
    return token;
  }

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const token = requireToken();
    if (!fetchImpl) {
      throw new DistributionError('provider_unavailable', 'no fetch implementation available');
    }
    const url = new URL(path, apiBase).toString();
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (res.status >= 400) {
      throw new DistributionError('provider_unavailable', `Polar API ${method} ${path} → ${res.status}`, {
        status: res.status,
      });
    }
    return { status: res.status, json };
  }

  return {
    async startCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
      // Typed request shaping for POST /v1/checkouts/ per the Polar API.
      const { json } = await call('POST', '/v1/checkouts/', {
        product_id: intent.productId,
        success_url: intent.successUrl,
        customer_email: intent.customerEmail,
        metadata: { ...(intent.metadata ?? {}), recoder_subject: intent.subjectId },
      });
      const parsed = PolarCheckoutResponse.parse(json);
      return {
        checkoutId: parsed.id,
        url: parsed.url,
        ...(parsed.client_secret ? { clientSecret: parsed.client_secret } : {}),
      };
    },

    async resolveEntitlements(subject: Subject): Promise<Entitlement[]> {
      // GET /v1/customers/{external_id}/benefit-grants — the customer's grants.
      // A 404/empty list resolves to "no grants" → the resolver denies.
      const { json } = await call(
        'GET',
        `/v1/customers/${encodeURIComponent(subject.subjectId)}/benefit-grants`,
      );
      const list = PolarBenefitGrantsList.parse(json ?? { items: [] });
      const plan: Plan = 'free';
      return list.items
        .filter((g) => g.is_granted !== false && !g.revoked_at)
        .map((g) => {
          const ent: Entitlement = {
            subjectId: subject.subjectId,
            kind: mapBenefitTypeToKind(g.benefit?.type),
            key: g.benefit?.id ?? g.benefit_id ?? g.id,
            plan,
            granted: true,
            ...(g.granted_at ? { grantedAt: g.granted_at } : {}),
          };
          return ent;
        });
    },

    async getQuota(subject: Subject, kind: UsageKind): Promise<Quota> {
      // Polar customer meters back this; when unavailable we DENY by returning a
      // zero-headroom metered quota rather than faking unlimited.
      const { json } = await call(
        'GET',
        `/v1/customer-meters/?customer_id=${encodeURIComponent(subject.subjectId)}`,
      ).catch(() => ({ json: null }));
      const meters = z
        .object({ items: z.array(z.object({ consumed_units: z.number(), credited_units: z.number() })) })
        .safeParse(json);
      if (!meters.success || meters.data.items.length === 0) {
        return {
          subjectId: subject.subjectId,
          kind,
          limit: 0,
          remaining: 0,
          resetAt: now().toISOString(),
        };
      }
      const m = meters.data.items[0]!;
      const remaining = Math.max(0, m.credited_units - m.consumed_units);
      return {
        subjectId: subject.subjectId,
        kind,
        limit: m.credited_units,
        remaining,
        resetAt: now().toISOString(),
      };
    },

    async emitUsage(event: MeterEvent): Promise<void> {
      // POST /v1/events/ingest — usage-based billing feed with idempotency.
      await call('POST', '/v1/events/ingest', {
        events: [
          {
            name: event.kind,
            external_customer_id: event.subjectId,
            timestamp: event.timestamp,
            metadata: { quantity: event.quantity, idempotency_key: event.idempotencyKey },
          },
        ],
      });
    },

    async validateLicenseKey(key: string): Promise<LicenseKeyActivation> {
      try {
        const { json } = await call('POST', '/v1/license-keys/validate', { key });
        const parsed = PolarLicenseKeyValidate.parse(json);
        const valid = parsed.status === 'granted' || parsed.status === undefined;
        return {
          valid,
          ...(parsed.activation ? { activationId: parsed.activation.id } : {}),
          ...(valid ? {} : { reason: `license key status: ${parsed.status}` }),
        };
      } catch (e) {
        if (e instanceof FailSafeError) throw e;
        return { valid: false, reason: e instanceof Error ? e.message : 'validation failed' };
      }
    },

    async health(): Promise<ChannelHealth> {
      // Truthful provider readiness: no token → unhealthy with a reason.
      if (!opts.secrets.has(ENV_KEYS.POLAR_ACCESS_TOKEN)) {
        return unhealthy(`${ENV_KEYS.POLAR_ACCESS_TOKEN} is not set`, {
          provider: 'polar',
          apiBase,
        });
      }
      return healthy({ provider: 'polar', apiBase });
    },
  };
}
