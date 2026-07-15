/**
 * `TenancyService` — the multi-tenancy isolation + quota gate that fronts EVERY
 * downstream cloud write (sandbox provision, preview deploy, domain add).
 *
 * Three responsibilities (doc §3):
 *   1. RESOLVE  — load a `Tenant` (tier / isolation / region / quota) for a
 *      subject, deny-safe when Postgres is down.
 *   2. QUOTA    — deny-first headroom decisions, optionally tightened by the
 *      Phase-9 billing entitlement (consumed through a THIN LOCAL PORT so this
 *      domain never hard-imports the billing module; absent ⇒ tenant quota
 *      stands alone, never a faked lift).
 *   3. PLACEMENT — the self-host-vs-cloud routing every provisioning path keys
 *      off (tier → target + ordered provider candidates + isolation).
 *
 * Fail-safe law (non-negotiable, doc §37): any uncertainty — repo down, unknown
 * tenant, unreadable usage — resolves to DENY / zero headroom, NEVER an
 * optimistic allow. Quota exhaustion surfaces as `SERVICE_UNAVAILABLE` (doc §8).
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { degraded, healthy, unhealthy } from '../../../shared/health-types.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { TenantRepository } from '../ports/cloud-repository.port.js';
import { hasCloudProvider, tierQuota, type CloudConfig } from '../config.js';
import {
  PROVIDER_IDS,
  type CloudQuotaDecision,
  type CloudQuotaKind,
  type IsolationLevel,
  type Placement,
  type PlacementTarget,
  type ProviderId,
  type Tenant,
  type TenantQuota,
  type TenantTier,
} from '../types.js';

const SERVICE_NAME = 'cloud.tenancy';

/**
 * A thin, LOCAL port onto the Phase-9 billing entitlement. Tenancy consumes it
 * to TIGHTEN a tenant's quota (never to widen it). It is optional: when the
 * billing dep is not wired, `undefined` ⇒ the tenant-row quota stands alone
 * (degrade-safe — a missing billing seam never blocks nor fakes a lift).
 */
export interface TenantBillingQuotaPort {
  /**
   * The max units billing entitles this tenant to for a cloud quota kind, or
   * `null` when billing is unavailable/unconfigured. `0`/negative ⇒ unlimited.
   */
  entitledLimit(tenant: Tenant, kind: CloudQuotaKind): Promise<number | null> | number | null;
}

/** How a caller identifies the tenant to resolve (precedence: id → org → owner). */
export interface TenantRef {
  readonly tenantId?: string | null;
  readonly orgId?: string | null;
  readonly ownerUserId?: string | null;
}

export interface TenancyServiceDeps {
  readonly repo: TenantRepository;
  readonly config: CloudConfig;
  readonly logger: Logger;
  /** Optional billing quota tightener (Phase-9 seam; absent ⇒ tenant quota alone). */
  readonly billingQuota?: TenantBillingQuotaPort;
}

/** Map a tenant quota kind to its ceiling field on {@link TenantQuota}. */
function limitFor(quota: TenantQuota, kind: CloudQuotaKind): number {
  switch (kind) {
    case 'sandbox':
      return quota.maxSandboxes;
    case 'concurrent':
      return quota.maxConcurrent;
    case 'preview':
      return quota.maxPreview;
  }
}

/**
 * Intersect a tenant ceiling with a billing ceiling under 0-as-unlimited
 * semantics. Billing may only ever TIGHTEN — never raise a tenant's ceiling.
 */
function tighten(current: number, billing: number | null): number {
  if (billing == null || billing <= 0) return current; // billing unlimited/absent
  if (current <= 0) return billing; // tenant unlimited → billing caps
  return Math.min(current, billing);
}

/** Placement rules per tier (isolation defaults + provider preference order). */
function placementForTier(tier: TenantTier): { target: PlacementTarget; providers: readonly ProviderId[]; isolation: IsolationLevel } {
  switch (tier) {
    case 'self-host':
      return { target: 'local', providers: ['local'], isolation: 'shared' };
    case 'cloud':
      return { target: 'cloud', providers: ['daytona', 'e2b', 'local'], isolation: 'dedicated' };
    case 'teams':
      return { target: 'cloud', providers: ['daytona', 'e2b'], isolation: 'isolated' };
  }
}

export interface TenancyService {
  /** Load a tenant. Repo down ⇒ `Err(SERVICE_UNAVAILABLE)`; unknown ⇒ `Err(NOT_FOUND)`. */
  resolve(ref: TenantRef): Promise<Result<Tenant, AppError>>;
  /** Resolve, auto-provisioning a default self-host tenant when none exists. */
  ensure(ref: TenantRef & { ownerUserId: string }): Promise<Result<Tenant, AppError>>;
  /** The effective quota after billing tightening (degrade-safe). */
  effectiveQuota(tenant: Tenant): Promise<TenantQuota>;
  /** Deny-first headroom decision for `kind` given the current `used` count. */
  checkQuota(quota: TenantQuota, kind: CloudQuotaKind, used: number): CloudQuotaDecision;
  /** The self-host-vs-cloud routing decision for a tenant. */
  placement(tenant: Tenant): Placement;
  /** Truthful health (degraded when the tenant repo / Postgres is impaired). */
  health(): ComponentHealth;
}

export function createTenancyService(deps: TenancyServiceDeps): TenancyService {
  const { repo, config, logger, billingQuota } = deps;

  async function resolve(ref: TenantRef): Promise<Result<Tenant, AppError>> {
    if (!repo.isAvailable()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Tenant store is unavailable.'));
    }
    try {
      let tenant: Tenant | null = null;
      if (ref.tenantId) tenant = await repo.getById(ref.tenantId);
      if (!tenant && ref.orgId) tenant = await repo.getByOrg(ref.orgId);
      if (!tenant && ref.ownerUserId) tenant = await repo.getByOwner(ref.ownerUserId);
      if (!tenant) return err(createError(ErrorCode.NOT_FOUND, 'No tenant found for the subject.'));
      return ok(tenant);
    } catch (cause) {
      logger.error({ err: cause }, 'tenancy.resolve failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Tenant resolution failed.', { cause }));
    }
  }

  async function ensure(ref: TenantRef & { ownerUserId: string }): Promise<Result<Tenant, AppError>> {
    const existing = await resolve(ref);
    if (existing.ok) return existing;
    // Only auto-provision on a clean "not found" — never paper over a repo-down.
    if (existing.error.code !== ErrorCode.NOT_FOUND) return existing;
    const tier = config.defaultTier;
    try {
      const tenant = await repo.upsert({
        id: randomUUID(),
        orgId: ref.orgId ?? null,
        ownerUserId: ref.ownerUserId,
        tier,
        isolationLevel: placementForTier(tier).isolation,
        region: config.defaultRegion,
        quota: tierQuota(config, tier),
      });
      return ok(tenant);
    } catch (cause) {
      logger.error({ err: cause }, 'tenancy.ensure failed to provision default tenant');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Could not provision a tenant.', { cause }));
    }
  }

  async function effectiveQuota(tenant: Tenant): Promise<TenantQuota> {
    if (!billingQuota) return tenant.quota;
    try {
      const [sandbox, concurrent, preview] = await Promise.all([
        billingQuota.entitledLimit(tenant, 'sandbox'),
        billingQuota.entitledLimit(tenant, 'concurrent'),
        billingQuota.entitledLimit(tenant, 'preview'),
      ]);
      return {
        ...tenant.quota,
        maxSandboxes: tighten(tenant.quota.maxSandboxes, sandbox),
        maxConcurrent: tighten(tenant.quota.maxConcurrent, concurrent),
        maxPreview: tighten(tenant.quota.maxPreview, preview),
      };
    } catch (cause) {
      // Degrade-safe: a billing lookup failure never blocks — the tenant quota stands.
      logger.warn({ err: cause }, 'tenancy.effectiveQuota billing tighten failed; using tenant quota');
      return tenant.quota;
    }
  }

  function checkQuota(quota: TenantQuota, kind: CloudQuotaKind, used: number): CloudQuotaDecision {
    const limit = limitFor(quota, kind);
    // Fail-safe: an unreadable usage count is treated as exhausted, never allowed.
    if (!Number.isFinite(used) || used < 0) {
      return { allowed: false, kind, limit, used: Number.NaN, remaining: 0, reason: 'usage_unknown' };
    }
    if (limit <= 0) {
      // Unlimited ceiling for this kind.
      return { allowed: true, kind, limit: 0, used, remaining: Number.MAX_SAFE_INTEGER };
    }
    const remaining = limit - used;
    if (remaining <= 0) {
      return { allowed: false, kind, limit, used, remaining: 0, reason: 'quota_exceeded' };
    }
    return { allowed: true, kind, limit, used, remaining };
  }

  function placement(tenant: Tenant): Placement {
    const rule = placementForTier(tenant.tier);
    // Drop off-box providers when no cloud key is configured; local always remains
    // available for the self-host fallback. Ordering is preserved.
    const cloudReady = hasCloudProvider(config);
    const candidates = rule.providers.filter((p) => {
      if (p === 'local') return config.localEnabled;
      return cloudReady && (p === 'daytona' ? config.daytona.present : config.e2b.present);
    });
    // Keep only known provider ids, in the tier's preferred order.
    const ordered = PROVIDER_IDS.filter((p) => candidates.includes(p));
    return {
      target: rule.target,
      providerCandidates: ordered,
      region: tenant.region,
      isolationLevel: tenant.isolationLevel,
    };
  }

  function health(): ComponentHealth {
    if (!repo.isAvailable()) {
      return unhealthy(SERVICE_NAME, 'Tenant store (Postgres) unavailable.');
    }
    if (!hasCloudProvider(config) && config.defaultTier !== 'self-host') {
      return degraded(SERVICE_NAME, 'No cloud sandbox provider configured; cloud tiers degrade to unavailable.');
    }
    return healthy(SERVICE_NAME, { defaultTier: config.defaultTier, defaultRegion: config.defaultRegion });
  }

  return { resolve, ensure, effectiveQuota, checkQuota, placement, health };
}

/**
 * Translate a denied quota decision into the canonical `SERVICE_UNAVAILABLE`
 * envelope (doc §8: quota exhaustion is a truthful "temporarily unavailable",
 * user-safe, never a 200). Callers pass this to `sendError` at the edge.
 */
export function quotaDeniedError(decision: CloudQuotaDecision): AppError {
  const details = { kind: decision.kind, limit: decision.limit, used: decision.used, reason: decision.reason };
  const message =
    decision.reason === 'usage_unknown'
      ? 'Quota usage is temporarily unreadable; please retry.'
      : `Quota exhausted for ${decision.kind} (${decision.used}/${decision.limit}).`;
  return createError(ErrorCode.SERVICE_UNAVAILABLE, message, { details });
}
