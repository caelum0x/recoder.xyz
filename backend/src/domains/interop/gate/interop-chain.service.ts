/**
 * `InteropChainService` — the ONE concrete `InteropChain` (conflict #1). Every
 * HTTP route + MCP tool call in the whole backend passes `run(ctx)` before its
 * handler runs. Pipeline: `authorize → risk → policy → audit`, fail-closed.
 *
 *   1. AUTHORIZE — the caller must be a resolved, present `Principal`. A `null`
 *      principal (route mounted without identity, or strict-auth with no
 *      credential) is denied at this stage. An anonymous principal may READ but
 *      never WRITE.
 *   2/3/4. RISK → POLICY → AUDIT — delegated to the governance gate (the single
 *      source of the `decide → risk → audit` pipeline, byte-interop with the Rust
 *      kernel):
 *        - WRITE edges call `gate.decide()` → full risk classification + a
 *          durable Merkle audit seal. `allow` admits; `deny`/`needs_approval`
 *          block with a typed reason + the sealed audit tip.
 *        - READ edges call `gate.route()` → risk + policy hint only (no durable
 *          seal — sealing every read would serialize all reads behind the audit
 *          advisory lock and is unnecessary; reads stay served while writes fail
 *          closed, per the governance degrade posture).
 *
 * FAIL-CLOSED: a denied edge is a RETURNED `InteropDecision { admit: false }`
 * with the rejecting stage + reason — never a thrown 500. An evaluator FAULT
 * (through the degrade-safe gate adapter) also yields `admit: false`. `degraded`
 * is truthful: it reflects the gate verdict's own `degraded` flag, or `true`
 * whenever the gate was unavailable.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  InteropChain,
  InteropContext,
  InteropDecision,
  InteropRejectionStage,
} from '../../governance/ports/interop.port.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateDecisionContext, GovernanceEffect, RiskTier } from '../../governance/types.js';
import { createGovernanceGateAdapter, type DegradeSafeGate } from './governance-gate.adapter.js';

export interface InteropChainDeps {
  /** The governance write/route seam. Absent → every edge fails closed. */
  readonly gate?: GovernanceGate;
  readonly logger?: Logger;
}

export class InteropChainService implements InteropChain {
  private readonly gate: DegradeSafeGate;
  private readonly log?: Logger;

  constructor(deps: InteropChainDeps) {
    this.gate = createGovernanceGateAdapter(deps.gate, deps.logger);
    this.log = deps.logger;
  }

  async run(ctx: InteropContext): Promise<InteropDecision> {
    // --- Stage 1: authorize --------------------------------------------------
    if (!ctx.principal) {
      return reject('authorize', 'deny', 'high', 'Unauthenticated edge call rejected (fail-closed).', false);
    }
    if (ctx.principal.isAnonymous && ctx.isWrite) {
      return reject('authorize', 'deny', 'high', 'Anonymous principals may not perform writes.', false);
    }

    const gateCtx: GateDecisionContext = {
      taskId: readString(ctx.metadata, 'taskId'),
      runId: readString(ctx.metadata, 'runId'),
      target: ctx.target,
      metadata: {
        ...(ctx.metadata ?? {}),
        method: ctx.method,
        route: ctx.route,
        requestId: ctx.requestId,
        edge: true,
      },
    };

    // --- Stages 2-4: risk → policy → audit (delegated to the gate) -----------
    if (ctx.isWrite) {
      const verdict = await this.gate.decide(ctx.action, ctx.principal, gateCtx);
      const admit = verdict.effect === 'allow';
      return {
        admit,
        effect: verdict.effect,
        tier: verdict.tier,
        reason: verdict.reason,
        rejectedAt: admit ? undefined : rejectionStageFor(verdict.effect),
        auditHash: verdict.auditHash,
        degraded: verdict.degraded,
      };
    }

    // Read edge: risk + policy hint, no durable audit seal.
    const hint = await this.gate.route(ctx.action, ctx.principal, gateCtx);
    const admit = hint.routable;
    return {
      admit,
      effect: admit ? 'allow' : 'deny',
      tier: hint.tier,
      reason: hint.reason,
      rejectedAt: admit ? undefined : 'policy',
      // route() carries no durable seal; degraded is only knowable as `true`
      // when the gate itself was unavailable (the adapter marks that path).
      degraded: !this.gate.wired,
    };
  }
}

/** Factory (mirrors the doc's `createInteropChain(deps)` seam). */
export function createInteropChain(deps: InteropChainDeps): InteropChain {
  return new InteropChainService(deps);
}

// --- helpers -----------------------------------------------------------------

/** Which chain stage a blocking gate effect maps to (for typed edge errors). */
function rejectionStageFor(effect: GovernanceEffect): InteropRejectionStage {
  // `needs_approval` and `deny` both block at the policy stage of the chain.
  return effect === 'needs_approval' ? 'policy' : 'policy';
}

/** Build a fail-closed rejection decision (never an exception). */
function reject(
  stage: InteropRejectionStage,
  effect: GovernanceEffect,
  tier: RiskTier,
  reason: string,
  degraded: boolean,
): InteropDecision {
  return { admit: false, effect, tier, reason, rejectedAt: stage, degraded };
}

/** Read a string field from sanitized edge metadata (defensive; never throws). */
function readString(meta: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === 'string' ? v : undefined;
}
