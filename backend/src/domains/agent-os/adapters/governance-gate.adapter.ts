/**
 * `governance-gate.adapter` — the thin, deny-biased wrapper agent-os writes call
 * before they persist (domain doc §1.4, §8). It CONSUMES the single frozen
 * {@link GovernanceGate} composed by the governance domain (approvals + work-
 * locks are ceded there — conflicts #2/#5) and adapts it to a domain-friendly
 * `guard(action, ctx)` that agent-os services + the run-event ingest use.
 *
 * Fail-safe posture (never a faked allow):
 *  - The gate itself fails CLOSED (synthetic deny) on a kernel fault. This
 *    adapter additionally catches any INFRA throw and returns a synthetic deny,
 *    so an agent-os write never proceeds on an errored gate.
 *  - A missing owner resolves to an `internal` system principal (the run-event
 *    spine is a trusted internal emitter); owner scoping is enforced upstream.
 */
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../ports/governance-gate.port.js';
import type { GateDecisionContext, GateVerdict } from '../ports/governance-gate.port.js';
import type { GateTarget } from '../../governance/types.js';

/** The internal system actor the spine attributes un-owned control-plane writes to. */
const SYSTEM_PRINCIPAL_ID = 'agent-os';

/** A domain-shaped decision (the composer/services branch on `allowed`). */
export interface AgentOsGateDecision {
  /** True iff the write may proceed (`effect === 'allow'`). */
  readonly allowed: boolean;
  /** The raw gate effect (`allow` | `deny` | `needs_approval`). */
  readonly effect: GateVerdict['effect'];
  readonly tier: GateVerdict['tier'];
  /** Human-readable reason (safe to surface/log; no secrets). */
  readonly reason: string;
  /** The approval gate id when `effect === 'needs_approval'`. */
  readonly approvalId?: string;
  /** Canonical governed resource to bind into an approval request. */
  readonly target?: string;
  /** True whenever the verdict did not come from the in-proc napi kernel. */
  readonly degraded: boolean;
}

/** What a guarded agent-os write declares about itself. */
export interface AgentOsGuardInput {
  /** The owner the write is attributed to (from the run-event envelope). */
  readonly ownerId?: string;
  /** Correlation ids for audit. */
  readonly taskId?: string;
  readonly runId?: string;
  /** The concrete target (path/command/tool/env). Defaults to an empty target. */
  readonly target?: GateTarget;
  /** Sanitized metadata captured into the audit detail. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentOsGovernanceGate {
  /** Guard one write. Deny-biased: returns `{ allowed: false }` on any fault. */
  guard(action: string, input: AgentOsGuardInput): Promise<AgentOsGateDecision>;
}

function systemPrincipal(ownerId?: string): Principal {
  return {
    userId: ownerId ?? SYSTEM_PRINCIPAL_ID,
    scopes: ['internal'],
    kind: 'internal',
    isAnonymous: false,
    raw: null,
  };
}

export function createGovernanceGateAdapter(gate: GovernanceGate): AgentOsGovernanceGate {
  return {
    async guard(action, input) {
      const ctx: GateDecisionContext = {
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        target: input.target ?? {},
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      try {
        const verdict = await gate.decide(action, systemPrincipal(input.ownerId), ctx);
        return {
          allowed: verdict.effect === 'allow',
          effect: verdict.effect,
          tier: verdict.tier,
          reason: verdict.reason,
          ...(verdict.approvalId ? { approvalId: verdict.approvalId } : {}),
          ...(verdict.target ? { target: verdict.target } : {}),
          degraded: verdict.degraded,
        };
      } catch (error) {
        // INFRA fault — fail CLOSED. Never let a write proceed on an errored gate.
        const reason = error instanceof Error ? error.message : 'governance gate unavailable';
        return { allowed: false, effect: 'deny', tier: 'critical', reason, degraded: true };
      }
    },
  };
}
