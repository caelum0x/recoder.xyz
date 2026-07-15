/**
 * `createQuotaService` — the per-run / per-token / per-engine quota checker, with
 * the FAIL-SAFE DENY PATH FIRST.
 *
 * This is the focused headroom engine the {@link EntitlementGate} and the
 * conductor pre-dispatch gate lean on: given a subject + {@link UsageKind}, does
 * the current billing window still have `cost` units left? The evaluation order
 * is deliberately deny-first (doc §37) — every uncertainty is resolved as a DENY
 * or ZERO headroom BEFORE any allow is computed:
 *
 *   1. metering repo unavailable        → DENY  (`metering_unavailable`)
 *   2. BYOK subject on a token kind      → ALLOW (bypass, but features still gate)
 *   3. unlimited tier (`limit === 0`)    → ALLOW
 *   4. usage read throws                 → DENY  (`metering_unavailable`)
 *   5. remaining < cost                  → DENY  (`quota_exceeded`)
 *   6. otherwise                         → ALLOW
 *
 * `consume` is the enforcement primitive: it checks headroom, and ONLY on an
 * allow writes the usage through the durable {@link MeteringService} ledger
 * (idempotent) — so the read gate and the ledger write never drift apart.
 */
import type { Logger } from '../../../shared/logger.js';
import {
  degraded as degradedHealth,
  healthy,
  type ComponentHealth,
} from '../../../shared/health-types.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { PlanCatalog } from './plan-catalog.service.js';
import type { MeteringService } from './metering.service.js';
import {
  BYOK_BYPASS_KINDS,
  type BillingSubject,
  type PlanTier,
  type QuotaDecision,
  type UsageKind,
} from '../types.js';

const SERVICE_NAME = 'billing.quota';

/** The current UTC calendar-month window quota is metered against. */
function monthlyWindow(now: Date): { windowStart: string; resetAt: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { windowStart: start.toISOString(), resetAt: reset.toISOString() };
}

/** Coerce a cost to a positive integer (fail safe: a bad cost is treated as 1). */
function positiveCost(cost: number | undefined): number {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return 1;
  const n = Math.trunc(cost);
  return n > 0 ? n : 1;
}

/** The result of a `consume`: the decision + whether the ledger write landed. */
export interface QuotaConsumeResult {
  readonly decision: QuotaDecision;
  /** True when a fresh usage event was written (false on deny OR idempotent dup). */
  readonly recorded: boolean;
}

/** Optional attribution carried onto the ledger write when consuming. */
export interface ConsumeContext {
  readonly runId?: string | null;
  readonly engine?: string | null;
  readonly idempotencyKey?: string;
  readonly occurredAt?: string;
}

export interface QuotaService {
  /** Read-only headroom check (fail-safe deny path first). */
  check(subject: BillingSubject, kind: UsageKind, cost?: number): Promise<QuotaDecision>;
  /** Check then, only on allow, durably record the usage via the metering ledger. */
  consume(
    subject: BillingSubject,
    kind: UsageKind,
    cost?: number,
    ctx?: ConsumeContext,
  ): Promise<QuotaConsumeResult>;
  /** Truthful health (degraded when the metering repo is unavailable). */
  health(): ComponentHealth;
}

export interface QuotaServiceDeps {
  readonly repo: MeteringRepository;
  readonly catalog: PlanCatalog;
  /**
   * Effective-plan resolver: `max(auth plan, webhook-confirmed subscription)`.
   * Injected (usually the {@link EntitlementGate}'s `resolvePlan`) so the quota
   * service does not re-derive plan algebra. Fail safe: a throw ⇒ `free` floor.
   */
  readonly resolvePlan: (subject: BillingSubject) => Promise<PlanTier> | PlanTier;
  /**
   * BYOK resolver (subject brings its own AI provider key → skips token quota).
   * Optional: absent ⇒ `false` (fail safe — token quota enforced by default).
   */
  readonly resolveByok?: (subject: BillingSubject) => Promise<boolean> | boolean;
  /** The durable ledger `consume` writes through. Optional: absent ⇒ check-only. */
  readonly metering?: MeteringService;
  readonly logger?: Logger;
  /** Injectable clock for deterministic window math in tests. */
  readonly now?: () => Date;
}

export function createQuotaService(deps: QuotaServiceDeps): QuotaService {
  const { repo, catalog } = deps;
  const clock = deps.now ?? (() => new Date());

  async function resolvePlanSafe(subject: BillingSubject): Promise<PlanTier> {
    try {
      return catalog.normalize(await deps.resolvePlan(subject));
    } catch (error) {
      deps.logger?.warn?.({ error, subjectId: subject.subjectId }, 'quota: plan resolution failed → free floor');
      return 'free';
    }
  }

  async function isByok(subject: BillingSubject): Promise<boolean> {
    if (typeof subject.hasOwnApiKey === 'boolean') return subject.hasOwnApiKey;
    try {
      return (await deps.resolveByok?.(subject)) ?? false;
    } catch {
      return false; // fail safe: enforce token quota when BYOK is uncertain
    }
  }

  async function check(subject: BillingSubject, kind: UsageKind, cost = 1): Promise<QuotaDecision> {
    const units = positiveCost(cost);
    const plan = await resolvePlanSafe(subject);
    const { resetAt } = monthlyWindow(clock());
    const limit = catalog.quotaLimit(plan, kind);
    const base = { plan, kind, resetAt } as const;

    // (1) DENY FIRST: metering unreachable ⇒ zero headroom (never allow-by-default).
    if (!repo.isAvailable()) {
      return {
        ...base,
        allowed: false,
        limit,
        remaining: 0,
        byokBypass: false,
        reason: 'metering_unavailable',
        message: 'metering repository unavailable; quota denied (fail safe)',
      };
    }

    // (2) BYOK bypass — only for token-metered kinds; features still gate elsewhere.
    if (BYOK_BYPASS_KINDS.includes(kind) && (await isByok(subject))) {
      return { ...base, allowed: true, limit, remaining: limit, byokBypass: true };
    }

    // (3) Unlimited tier (0) always has headroom.
    if (limit === 0) {
      return { ...base, allowed: true, limit: 0, remaining: 0, byokBypass: false };
    }

    // (4) Read usage; a read failure is a DENY (fail safe), never an allow.
    let used: number;
    try {
      const { windowStart } = monthlyWindow(clock());
      used = await repo.usageSince(subject.subjectId, kind, windowStart);
    } catch (error) {
      deps.logger?.warn?.({ error, subjectId: subject.subjectId, kind }, 'quota: usage read failed → deny');
      return {
        ...base,
        allowed: false,
        limit,
        remaining: 0,
        byokBypass: false,
        reason: 'metering_unavailable',
        message: 'metering read failed; quota denied (fail safe)',
      };
    }

    // (5)/(6) Compute headroom and decide.
    const remaining = Math.max(0, limit - used);
    const allowed = remaining >= units;
    return {
      ...base,
      allowed,
      limit,
      remaining,
      byokBypass: false,
      ...(allowed
        ? {}
        : {
            reason: 'quota_exceeded' as const,
            message: `quota exceeded for ${kind}: ${remaining}/${limit} remaining`,
          }),
    };
  }

  async function consume(
    subject: BillingSubject,
    kind: UsageKind,
    cost = 1,
    ctx: ConsumeContext = {},
  ): Promise<QuotaConsumeResult> {
    const units = positiveCost(cost);
    const decision = await check(subject, kind, units);

    // Deny (or BYOK bypass, or unlimited) → nothing to meter.
    if (!decision.allowed || decision.byokBypass || decision.limit === 0) {
      return { decision, recorded: false };
    }

    // No ledger wired → the caller only wanted a gate, not enforcement.
    if (!deps.metering) return { decision, recorded: false };

    let recorded = false;
    try {
      const write = await deps.metering.record({
        subjectId: subject.subjectId,
        kind,
        quantity: units,
        runId: ctx.runId ?? null,
        engine: ctx.engine ?? null,
        ...(ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : {}),
        ...(ctx.occurredAt ? { occurredAt: ctx.occurredAt } : {}),
      });
      recorded = write.inserted;
    } catch (error) {
      // A ledger write failure must NOT report a successful consume — surface an
      // unrecorded allow so the caller can decide (retry / degrade).
      deps.logger?.warn?.({ error, subjectId: subject.subjectId, kind }, 'quota: consume ledger write failed');
      return { decision, recorded: false };
    }

    // Reflect the just-consumed units in the returned headroom (truthful view).
    const nextRemaining = recorded ? Math.max(0, decision.remaining - units) : decision.remaining;
    return { decision: { ...decision, remaining: nextRemaining }, recorded };
  }

  function health(): ComponentHealth {
    if (!repo.isAvailable()) {
      return degradedHealth(SERVICE_NAME, 'metering repository unavailable — quota checks deny (fail safe)');
    }
    return healthy(SERVICE_NAME);
  }

  return { check, consume, health };
}
