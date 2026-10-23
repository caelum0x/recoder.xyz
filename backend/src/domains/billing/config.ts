/**
 * `BillingConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry a `billing` slice,
 * so `sliceBillingConfig(app, overrides)` derives what it can from existing
 * slices (`runtime`) and takes the provider keys / product map through the
 * `overrides` seam bootstrap injects — exactly the governance-config pattern.
 * Until bootstrap wires them, every provider key is `null` and the adapters
 * report `down` (fail-safe law §37: absent key ⇒ truthful `SERVICE_UNAVAILABLE`,
 * never a faked readiness).
 *
 * Provider selection is `BILLING_PROVIDER` (default `polar`); each provider has
 * its own `*_ACCESS_TOKEN`/`*_API_KEY` + `*_WEBHOOK_SECRET`. Keys are held only
 * in memory as `string | null`; a `*Present` boolean drives health/logging so a
 * secret value is never logged.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';
import { BILLING_PROVIDERS, PLAN_TIERS, type BillingProviderName, type PlanTier } from './types.js';

/** A single provider's credential slice (value in memory + presence flag). */
export const providerCredentialSchema = z.object({
  /** The API key / access token value, held in memory only; `null` = absent. */
  apiKey: z.string().nullable(),
  /** True when {@link apiKey} is present (safe to log). */
  present: z.boolean(),
  /** The webhook signing secret, held in memory only; `null` = absent. */
  webhookSecret: z.string().nullable(),
  /** True when {@link webhookSecret} is present (safe to log). */
  webhookSecretPresent: z.boolean(),
  /** Optional API base override (managed vs sandbox vs self-hosted). */
  baseUrl: z.string().nullable(),
  /** Optional org/account id some providers scope calls by (e.g. Polar org). */
  organizationId: z.string().nullable(),
});

export type ProviderCredential = z.infer<typeof providerCredentialSchema>;

/**
 * The Railyard Mint usage-sink credential slice — deliberately NOT a
 * {@link providerCredentialSchema} MoR credential (no webhook secret, no
 * checkout participation; see `ports/usage-sink.port.ts`).
 */
export const railyardMintConfigSchema = z.object({
  baseUrl: z.string().nullable(),
  apiKey: z.string().nullable(),
  present: z.boolean(),
  /** Logical product id Mint attributes this instance's usage to, when set. */
  productId: z.string().nullable(),
});

export type RailyardMintConfig = z.infer<typeof railyardMintConfigSchema>;

/** Per-provider → per-tier product/price id map (config, never a hardcoded secret). */
export const planProductMapSchema = z.record(
  z.enum(PLAN_TIERS as unknown as [PlanTier, ...PlanTier[]]),
  z.string(),
);

export const billingConfigSchema = z.object({
  /** The active Merchant-of-Record provider. */
  provider: z.enum(BILLING_PROVIDERS as unknown as [BillingProviderName, ...BillingProviderName[]]),
  polar: providerCredentialSchema,
  creem: providerCredentialSchema,
  paddle: providerCredentialSchema,
  dodo: providerCredentialSchema,
  /**
   * `provider → (planTier → productId)`. The catalog resolves a checkout product
   * from `planProducts[activeProvider][tier]`. Empty when unconfigured (checkout
   * then fails safe with a truthful "no product mapped" error).
   */
  planProducts: z.record(
    z.enum(BILLING_PROVIDERS as unknown as [BillingProviderName, ...BillingProviderName[]]),
    planProductMapSchema,
  ),
  /** Meter batch flush cadence (ms). `0` disables the flush loop (local only). */
  meterFlushIntervalMs: z.number().int().nonnegative(),
  /** Railyard Mint usage-sink slice (edge adapter, see `providers/railyard-mint/`). */
  railyardMint: railyardMintConfigSchema,
  /** Solo/desktop mode — quota fails open when metering is unreachable (see `RuntimeConfig.soloMode`). */
  soloMode: z.boolean(),
  isProduction: z.boolean(),
});

export type BillingConfig = z.infer<typeof billingConfigSchema>;

/** A single provider's overrides bootstrap injects (not yet in AppConfig). */
export interface ProviderCredentialOverrides {
  readonly apiKey?: string | null;
  readonly webhookSecret?: string | null;
  readonly baseUrl?: string | null;
  readonly organizationId?: string | null;
}

/** The not-yet-in-AppConfig billing values bootstrap may inject. */
export interface BillingConfigOverrides {
  readonly provider?: BillingProviderName;
  readonly polar?: ProviderCredentialOverrides;
  readonly creem?: ProviderCredentialOverrides;
  readonly paddle?: ProviderCredentialOverrides;
  readonly dodo?: ProviderCredentialOverrides;
  readonly planProducts?: Partial<Record<BillingProviderName, Partial<Record<PlanTier, string>>>>;
  readonly meterFlushIntervalMs?: number;
  readonly railyardMint?: {
    readonly baseUrl?: string | null;
    readonly apiKey?: string | null;
    readonly productId?: string | null;
  };
}

function credential(o: ProviderCredentialOverrides | undefined): ProviderCredential {
  const apiKey = o?.apiKey ?? null;
  const webhookSecret = o?.webhookSecret ?? null;
  return {
    apiKey,
    present: apiKey !== null && apiKey.length > 0,
    webhookSecret,
    webhookSecretPresent: webhookSecret !== null && webhookSecret.length > 0,
    baseUrl: o?.baseUrl ?? null,
    organizationId: o?.organizationId ?? null,
  };
}

/**
 * Project the billing slice out of the whole config. Provider keys arrive via
 * `overrides` (bootstrap reads env once and injects). Absent overrides ⇒ every
 * key `null` ⇒ adapters `down` ⇒ module `degraded:true` (never a faked `up`).
 */
export function sliceBillingConfig(app: AppConfig, overrides: BillingConfigOverrides = {}): BillingConfig {
  return billingConfigSchema.parse({
    provider: overrides.provider ?? 'polar',
    polar: credential(overrides.polar),
    creem: credential(overrides.creem),
    paddle: credential(overrides.paddle),
    dodo: credential(overrides.dodo),
    planProducts: overrides.planProducts ?? {},
    meterFlushIntervalMs: overrides.meterFlushIntervalMs ?? (app.runtime.isProduction ? 30_000 : 0),
    railyardMint: {
      baseUrl: overrides.railyardMint?.baseUrl ?? null,
      apiKey: overrides.railyardMint?.apiKey ?? null,
      present: Boolean(overrides.railyardMint?.apiKey && overrides.railyardMint.apiKey.length > 0),
      productId: overrides.railyardMint?.productId ?? null,
    },
    soloMode: app.runtime.soloMode === true,
    isProduction: app.runtime.isProduction,
  });
}

/** The active provider's credential slice. */
export function activeProviderCredential(config: BillingConfig): ProviderCredential {
  return config[config.provider];
}

/** True when the active provider has a usable API key. */
export function isBillingConfigured(config: BillingConfig): boolean {
  return activeProviderCredential(config).present;
}
