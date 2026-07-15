/**
 * `CloudConfig` — the typed slice this domain consumes, derived from the injected
 * `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry a `cloud` slice, so
 * `sliceCloudConfig(app, overrides)` derives what it can from `runtime` and takes
 * the provider keys / preview signing secret / mesh endpoints through the
 * `overrides` seam bootstrap injects — the same pattern as `billing`/`governance`.
 * Until bootstrap wires them, every provider key is `null`, the signing secret is
 * `null`, and the adapters report `down` / edges return `SERVICE_UNAVAILABLE`
 * (fail-safe law §37: absent secret ⇒ truthful unavailable, never a faked `up`).
 *
 * Secrets are held only in memory as `string | null`; a `*Present` boolean drives
 * health/logging so a secret value is never logged.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';
import { TENANT_TIERS, type TenantQuota, type TenantTier } from './types.js';

/** A single cloud provider's credential slice (value in memory + presence flag). */
export const providerCredentialSchema = z.object({
  apiKey: z.string().nullable(),
  present: z.boolean(),
  baseUrl: z.string().nullable(),
});

export type CloudProviderCredential = z.infer<typeof providerCredentialSchema>;

/** Per-tier default resource ceilings (config, never a hardcoded secret). */
export const tenantQuotaSchema = z.object({
  maxSandboxes: z.number().int().nonnegative(),
  maxConcurrent: z.number().int().nonnegative(),
  maxPreview: z.number().int().nonnegative(),
  cpuMillis: z.number().int().positive(),
  memMb: z.number().int().positive(),
});

export const cloudConfigSchema = z.object({
  /** Default tier a freshly-resolved tenant lands in (deny-by-default = self-host). */
  defaultTier: z.enum(TENANT_TIERS as unknown as [TenantTier, ...TenantTier[]]),
  /** Default region pin for new tenants/sandboxes. */
  defaultRegion: z.string().min(1),
  /** Base domain signed preview URLs are minted under (`null` ⇒ preview disabled). */
  previewBaseDomain: z.string().nullable(),
  /** HMAC secret for signed preview URLs, in memory only (`null` ⇒ signing disabled). */
  previewSigningSecret: z.string().nullable(),
  /** True when {@link previewSigningSecret} is present (safe to log). */
  previewSigningSecretPresent: z.boolean(),
  /** TTL (seconds) a minted preview URL is valid for. */
  previewUrlTtlSeconds: z.number().int().positive(),
  /** Per-tier default quotas. Tenant rows may override; billing may only lower. */
  tierQuotas: z.record(
    z.enum(TENANT_TIERS as unknown as [TenantTier, ...TenantTier[]]),
    tenantQuotaSchema,
  ),
  daytona: providerCredentialSchema,
  e2b: providerCredentialSchema,
  /** Whether the local-container fallback provider is usable (self-host tier). */
  localEnabled: z.boolean(),
  /** ziti Go engine loopback endpoint (`null` ⇒ mesh adapter `down`). */
  zitiEndpoint: z.string().nullable(),
  /** recoder-xds Go engine loopback endpoint (`null` ⇒ mesh adapter `down`). */
  xdsEndpoint: z.string().nullable(),
  isProduction: z.boolean(),
});

export type CloudConfig = z.infer<typeof cloudConfigSchema>;

/** A single provider's overrides bootstrap injects (not yet in AppConfig). */
export interface CloudProviderCredentialOverrides {
  readonly apiKey?: string | null;
  readonly baseUrl?: string | null;
}

/** The not-yet-in-AppConfig cloud values bootstrap may inject. */
export interface CloudConfigOverrides {
  readonly defaultTier?: TenantTier;
  readonly defaultRegion?: string;
  readonly previewBaseDomain?: string | null;
  readonly previewSigningSecret?: string | null;
  readonly previewUrlTtlSeconds?: number;
  readonly tierQuotas?: Partial<Record<TenantTier, Partial<TenantQuota>>>;
  readonly daytona?: CloudProviderCredentialOverrides;
  readonly e2b?: CloudProviderCredentialOverrides;
  readonly localEnabled?: boolean;
  readonly zitiEndpoint?: string | null;
  readonly xdsEndpoint?: string | null;
}

/**
 * Conservative per-tier defaults. `self-host` is bounded by the machine (mostly
 * unlimited counts, modest per-sandbox caps); `cloud` and `teams` carry hard
 * count ceilings so a runaway tenant cannot exhaust the shared pool. These are
 * the FLOOR — a tenant row or a billing entitlement may raise/lower them.
 */
export const DEFAULT_TIER_QUOTAS: Readonly<Record<TenantTier, TenantQuota>> = {
  'self-host': { maxSandboxes: 0, maxConcurrent: 4, maxPreview: 0, cpuMillis: 2000, memMb: 4096 },
  cloud: { maxSandboxes: 20, maxConcurrent: 5, maxPreview: 10, cpuMillis: 2000, memMb: 4096 },
  teams: { maxSandboxes: 100, maxConcurrent: 25, maxPreview: 50, cpuMillis: 4000, memMb: 8192 },
};

function credential(o: CloudProviderCredentialOverrides | undefined): CloudProviderCredential {
  const apiKey = o?.apiKey ?? null;
  return {
    apiKey,
    present: apiKey !== null && apiKey.length > 0,
    baseUrl: o?.baseUrl ?? null,
  };
}

/** Merge per-tier quota overrides onto the {@link DEFAULT_TIER_QUOTAS} floor. */
function mergeTierQuotas(
  overrides: Partial<Record<TenantTier, Partial<TenantQuota>>> | undefined,
): Record<TenantTier, TenantQuota> {
  const out = {} as Record<TenantTier, TenantQuota>;
  for (const tier of TENANT_TIERS) {
    out[tier] = { ...DEFAULT_TIER_QUOTAS[tier], ...(overrides?.[tier] ?? {}) };
  }
  return out;
}

/**
 * Project the cloud slice out of the whole config. Provider keys + the preview
 * signing secret + mesh endpoints arrive via `overrides` (bootstrap reads env
 * once and injects). Absent overrides ⇒ keys `null` ⇒ adapters `down` ⇒ module
 * `degraded:true` (never a faked `up`).
 */
export function sliceCloudConfig(app: AppConfig, overrides: CloudConfigOverrides = {}): CloudConfig {
  const signingSecret = overrides.previewSigningSecret ?? null;
  return cloudConfigSchema.parse({
    defaultTier: overrides.defaultTier ?? 'self-host',
    defaultRegion: overrides.defaultRegion ?? 'us-east',
    previewBaseDomain: overrides.previewBaseDomain ?? null,
    previewSigningSecret: signingSecret,
    previewSigningSecretPresent: signingSecret !== null && signingSecret.length > 0,
    previewUrlTtlSeconds: overrides.previewUrlTtlSeconds ?? 3600,
    tierQuotas: mergeTierQuotas(overrides.tierQuotas),
    daytona: credential(overrides.daytona),
    e2b: credential(overrides.e2b),
    localEnabled: overrides.localEnabled ?? true,
    zitiEndpoint: overrides.zitiEndpoint ?? null,
    xdsEndpoint: overrides.xdsEndpoint ?? null,
    isProduction: app.runtime.isProduction,
  });
}

/** The default quota for a tier, from the sliced config. */
export function tierQuota(config: CloudConfig, tier: TenantTier): TenantQuota {
  return config.tierQuotas[tier] ?? DEFAULT_TIER_QUOTAS[tier];
}

/** True when at least one off-box provider (daytona/e2b) has a usable key. */
export function hasCloudProvider(config: CloudConfig): boolean {
  return config.daytona.present || config.e2b.present;
}

/** True when signed preview URLs can be minted (secret + base domain present). */
export function isPreviewConfigured(config: CloudConfig): boolean {
  return config.previewSigningSecretPresent && config.previewBaseDomain !== null;
}
