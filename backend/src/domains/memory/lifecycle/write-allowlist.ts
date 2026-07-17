/**
 * lifecycle/write-allowlist — a deterministic governance ALLOWLIST guard on every
 * memory WRITE (candidate propose / run-completion harvest). It is the memory
 * domain's local, pre-gate scope filter: a policy statement of "which scopes may
 * receive durable-worthy memory at all", enforced BEFORE the candidate is shaped
 * or mirrored into beads.
 *
 * TRUTHFUL DEGRADE: an EMPTY allowlist allows every scope (the open default that
 * preserves prior behavior and never fabricates a denial). A NON-EMPTY allowlist
 * denies any write whose scope is not present — a `deny` is returned as a
 * structured decision AND surfaced as a fail-closed `AUTHZ_PROJECT_ACCESS_DENIED`
 * by `assert`, never a silent drop and never a faked success.
 *
 * This is intentionally NOT the durable-promotion gate (that is
 * `GovernanceGate.decide('memory.promote', …)` in `memory-lifecycle.ts`); it is
 * the cheap, deterministic front-door check that keeps disallowed scopes from
 * ever entering the candidate store.
 */
import { ErrorCode, createError } from '../../../shared/errors.js';

/** The write being checked (scope + who proposed it, for the deny reason). */
export interface MemoryWriteContext {
  /** The scope the write targets (user|org|space|repo|path|agent|task-type). */
  readonly scope: string;
  /** Who proposed the write (a resolved principal id or a service agent id). */
  readonly proposedBy: string;
}

/** The truthful outcome of an allowlist check. */
export interface AllowlistDecision {
  /** `true` iff the scope is permitted (always true when the allowlist is empty). */
  readonly allowed: boolean;
  /** Why the write was denied (only set when `!allowed`). */
  readonly reason?: string;
}

export interface MemoryWriteAllowlist {
  /** The effective allowlist (empty means "all scopes allowed"). */
  readonly scopes: readonly string[];
  /** Non-throwing check — returns a structured allow/deny decision. */
  check(ctx: MemoryWriteContext): AllowlistDecision;
  /** Fail-closed assertion — throws `AUTHZ_PROJECT_ACCESS_DENIED` on a deny. */
  assert(ctx: MemoryWriteContext): void;
}

export interface MemoryWriteAllowlistConfig {
  /** Permitted write scopes; EMPTY/undefined → allow every scope (degrade-safe). */
  readonly scopes?: readonly string[];
}

/** Build the memory write allowlist guard from config (empty ⇒ allow-all). */
export function createMemoryWriteAllowlist(config: MemoryWriteAllowlistConfig): MemoryWriteAllowlist {
  // Freeze a trimmed, de-duplicated copy so the guard is immutable + hermetic.
  const scopes = Object.freeze(
    [...new Set((config.scopes ?? []).map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean))],
  );

  function check(ctx: MemoryWriteContext): AllowlistDecision {
    // Empty allowlist = no restriction (the open default; never fabricate a deny).
    if (scopes.length === 0) return { allowed: true };
    const scope = ctx.scope?.trim();
    if (scope && scopes.includes(scope)) return { allowed: true };
    return {
      allowed: false,
      reason: `memory write to scope "${scope || '(none)'}" is not on the governance allowlist [${scopes.join(', ')}]`,
    };
  }

  return {
    scopes,
    check,
    assert(ctx: MemoryWriteContext): void {
      const decision = check(ctx);
      if (!decision.allowed) {
        throw createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, decision.reason ?? 'memory write not allowed');
      }
    },
  };
}
