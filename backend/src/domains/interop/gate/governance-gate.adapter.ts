/**
 * `governance-gate.adapter` — a degrade-safe wrapper over the governance domain's
 * `GovernanceGate`. The interop chain calls the gate through THIS adapter so it
 * never has to handle a missing-or-faulting gate inline: an absent gate (not yet
 * wired) or a thrown fault ALWAYS yields a fail-closed synthetic result, never a
 * fake allow and never a thrown 500 the chain might treat as "admit".
 *
 * (The concrete `GovernanceGateService.decide` is itself fail-closed — it returns
 * a synthetic deny on kernel fault rather than throwing. This adapter adds the
 * one guarantee the gate can't: what happens when the gate reference itself is
 * `undefined` or its promise rejects for an infrastructural reason.)
 */
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type {
  GateDecisionContext,
  GateVerdict,
  GovernanceAction,
  RoutingHint,
} from '../../governance/types.js';

/** Raised only internally; the adapter converts it to a fail-closed verdict. */
export class GateDownError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'GateDownError';
  }
}

/** The narrow gate surface the interop chain consumes (decide for writes, route for reads). */
export interface DegradeSafeGate {
  /** WRITE seam: full `decide → risk → audit`; fail-closed synthetic deny on any fault. */
  decide(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<GateVerdict>;
  /** READ seam: routing/risk hint only (no durable audit seal); fail-closed on fault. */
  route(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<RoutingHint>;
  /** Truthful: is a real gate wired behind this adapter? */
  readonly wired: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** A fail-closed synthetic deny verdict (never a fake allow). */
function syntheticDeny(reason: string): GateVerdict {
  return {
    verdictId: `interop_gate_down_${Date.now()}`,
    requestId: `interop_req_${Date.now()}`,
    effect: 'deny',
    tier: 'critical',
    reason,
    degraded: true,
    engine: 'synthetic',
    createdAt: nowIso(),
  };
}

/** A fail-closed unroutable hint (reads deny when the gate is unavailable). */
function unroutable(reason: string): RoutingHint {
  return { routable: false, tier: 'critical', reason };
}

/**
 * Wrap a (possibly-undefined) `GovernanceGate` in the degrade-safe surface the
 * interop chain uses. When `gate` is `undefined`, every call fails closed.
 */
export function createGovernanceGateAdapter(
  gate: GovernanceGate | undefined,
  log?: Logger,
): DegradeSafeGate {
  return {
    wired: gate !== undefined,

    async decide(action, principal, ctx): Promise<GateVerdict> {
      if (!gate) {
        return syntheticDeny('Governance gate not wired — write denied (fail-closed).');
      }
      try {
        return await gate.decide(action, principal, ctx);
      } catch (err) {
        log?.error(
          { err: err instanceof Error ? err.message : String(err), action, actor: principal.userId },
          'interop: governance gate decide faulted — failing closed',
        );
        return syntheticDeny('Governance gate faulted — write denied (fail-closed).');
      }
    },

    async route(action, principal, ctx): Promise<RoutingHint> {
      if (!gate) {
        return unroutable('Governance gate not wired — edge denied (fail-closed).');
      }
      try {
        return await gate.route(action, principal, ctx);
      } catch (err) {
        log?.error(
          { err: err instanceof Error ? err.message : String(err), action, actor: principal.userId },
          'interop: governance gate route faulted — failing closed',
        );
        return unroutable('Governance gate faulted — edge denied (fail-closed).');
      }
    },
  };
}
