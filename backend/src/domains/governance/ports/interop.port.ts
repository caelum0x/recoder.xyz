/**
 * `InteropChain` — the EDGE seam: `authorize -> risk -> policy -> audit`. Every
 * HTTP route + MCP tool call passes this before the handler runs. Fail-closed.
 *
 * This port is declared in the governance domain (it calls the gate + audit
 * chain) but the concrete chain impl is resolved in Phase 3 step 5 as ONE
 * implementation (conflict #1: it lives in `interop`, calling governance's gate).
 * Domains guarding an edge compile against `run(ctx) -> InteropDecision`.
 *
 * Semantics: a denied edge is a returned {@link InteropDecision} with
 * `admit: false` + a typed reason — never a thrown 500 the caller might treat as
 * "admit". An evaluator FAULT also yields `admit: false` (fail-closed).
 */
import type { Principal } from '../../identity/types.js';
import type { GovernanceEffect, RiskTier, GateTarget } from '../types.js';

/** The inbound edge context the chain evaluates. */
export interface InteropContext {
  /** The resolved caller identity (or `null` when unauthenticated). */
  readonly principal: Principal | null;
  /** The action the edge maps to (dotted `resource.verb`). */
  readonly action: string;
  /** The concrete target of the edge call. */
  readonly target: GateTarget;
  /** HTTP method / MCP tool name for audit context. */
  readonly method?: string;
  /** The route path or MCP tool id. */
  readonly route?: string;
  /** Correlation id threaded into the audit entry. */
  readonly requestId?: string;
  /** Whether this edge is a WRITE (also flows through the gate `decide`). */
  readonly isWrite?: boolean;
  /** Arbitrary sanitized metadata (no secrets). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Which stage of the chain produced a rejection (for typed edge errors). */
export type InteropRejectionStage = 'authorize' | 'risk' | 'policy' | 'audit';

/** The chain's decision for an edge. */
export interface InteropDecision {
  /** Whether the handler may run. `false` is a fail-closed reject. */
  readonly admit: boolean;
  /** The governance effect that drove it (`deny`/`needs_approval` block). */
  readonly effect: GovernanceEffect;
  readonly tier: RiskTier;
  readonly reason: string;
  /** The stage that rejected, when `admit === false`. */
  readonly rejectedAt?: InteropRejectionStage;
  /** The durable audit tip that sealed this edge decision, when audit ran. */
  readonly auditHash?: string;
  /** Truthful: the decision used a degraded (non-napi) governance path. */
  readonly degraded: boolean;
}

export interface InteropChain {
  /** Run `authorize -> risk -> policy -> audit`. Fail-closed on any fault. */
  run(ctx: InteropContext): Promise<InteropDecision>;
}
