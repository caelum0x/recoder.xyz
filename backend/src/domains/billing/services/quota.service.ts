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
 * `consume` is the enforcement primitive. `check` is only an ADVISORY pre-filter;
 * the authoritative gate is an ATOMIC RESERVATION — a single guarded ledger write
 * (`metering.reserve` → `repo.reserveUsage`) that lands ONLY while the window total
 * stays within the limit. This closes the check-then-record TOCTOU: two concurrent
 * consumes that both pass the same advisory read can never both land — the loser is
 * refused and `consume` returns a hard `quota_exceeded` DENY, never a silent allow.
 */
import type { Logger } from '../../../shared/logger.js';
import {
  degraded as degradedHealth,
  healthy,
  type ComponentHealth,
} from '../../../shared/health-types.js';
import type { MeteringRepository, UsageReservation } from '../ports/metering-repo.port.js';
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
    if (allowed) {
      return { ...base, allowed, limit, remaining, byokBypass: false };
    }
    // #30: carry a structured upgrade CTA (current + lifting tier) on the deny so
    // callers can surface "upgrade to continue" rather than an opaque hard-deny.
    const suggestedTier = catalog.upgradeTierForQuota(plan, kind);
    return {
      ...base,
      allowed: false,
      limit,
      remaining,
      byokBypass: false,
      reason: 'quota_exceeded',
      message: `quota exceeded for ${kind}: ${remaining}/${limit} remaining`,
      ...(suggestedTier ? { upgrade: { currentTier: plan, suggestedTier } } : {}),
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

    // ATOMIC RESERVATION — closes the check→record TOCTOU. The `check` above is an
    // ADVISORY fast read; it is NOT the gate. The real gate is a single guarded
    // ledger write (metering.reserve → repo.reserveUsage) that only lands while the
    // window total stays within the limit. Two concurrent consumes that both passed
    // the same advisory read therefore cannot both land — at most one wins the last
    // unit, the other is refused. A refused reservation is a hard quota_exceeded
    // DENY (never a silent allow); a reservation error keeps the fail-safe deny.
    const { windowStart } = monthlyWindow(clock());
    let reservation: UsageReservation;
    try {
      reservation = await deps.metering.reserve(
        {
          subjectId: subject.subjectId,
          kind,
          quantity: units,
          runId: ctx.runId ?? null,
          engine: ctx.engine ?? null,
          ...(ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : {}),
          ...(ctx.occurredAt ? { occurredAt: ctx.occurredAt } : {}),
        },
        decision.limit,
        windowStart,
      );
    } catch (error) {
      // A reservation failure must NOT report a successful consume — deny fail safe.
      deps.logger?.warn?.({ error, subjectId: subject.subjectId, kind }, 'quota: consume reservation failed');
      return {
        decision: {
          ...decision,
          allowed: false,
          remaining: 0,
          reason: 'metering_unavailable',
          message: 'metering reservation failed; quota denied (fail safe)',
        },
        recorded: false,
      };
    }

    // Refused: the window filled between the advisory check and the atomic
    // reservation (a concurrent consume won the last unit) → deny, do not record.
    if (!reservation.reserved) {
      const suggestedTier = catalog.upgradeTierForQuota(decision.plan, kind);
      return {
        decision: {
          ...decision,
          allowed: false,
          remaining: 0,
          reason: 'quota_exceeded',
          message: `quota exceeded for ${kind}: 0/${decision.limit} remaining`,
          ...(suggestedTier ? { upgrade: { currentTier: decision.plan, suggestedTier } } : {}),
        },
        recorded: false,
      };
    }

    // Reflect the just-reserved units in the returned headroom (truthful view).
    const recorded = reservation.inserted;
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
