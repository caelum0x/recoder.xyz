/**
 * `GovernanceGate` — THE write seam. The one place every mutation in the whole
 * backend passes before it happens (ARCHITECTURE: governance is the moat).
 *
 * FROZEN CONTRACT — Phase 3 seam. Every stateful domain (conductor, agent-os,
 * billing, memory, cloud, …) compiles against `decide(action, principal, ctx)`
 * while the concrete `GovernanceGateService` is composed behind it. Do not widen
 * or narrow these signatures without a cross-domain migration.
 *
 * Semantics (the core security invariant):
 *  - `decide` NEVER throws for a policy outcome — a deny is a returned
 *    {@link GateVerdict} with `effect: 'deny'`, not an exception.
 *  - A kernel/infrastructure fault fails CLOSED: the gate returns a synthetic
 *    `deny` verdict (`engine: 'synthetic'`, `degraded: true`), never a fake allow
 *    and never a thrown 500 that a caller might treat as "proceed".
 *  - `degraded === true` is set truthfully whenever the verdict did not come from
 *    the in-proc napi kernel.
 */
import type { Principal } from '../../identity/types.js';
import type {
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
  ToolEnforcement,
  RoutingHint,
  AuditEntryInput,
  AuditRecord,
  AuditVerification,
} from '../types.js';

export interface GovernanceGate {
  /**
   * Run the `decide -> risk -> audit` pipeline for a proposed action. Returns a
   * {@link GateVerdict} whose `effect` is the source of truth for whether the
   * caller may proceed. Fails CLOSED (synthetic deny) on any kernel fault.
   *
   * @param action the dotted `resource.verb` (e.g. `pr.create`, `file.write`)
   * @param principal the resolved caller identity (from the identity domain)
   * @param ctx the concrete target + work-locks + decision context
   */
  decide(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<GateVerdict>;

  /**
   * Enforce a single tool invocation directly (runtime-adapter seam). Deny-biased
   * on fault. Does not open an approval gate — it is a hard allow/deny check.
   */
  enforceTool(
    toolName: string,
    input: string,
    principal: Principal,
    ctx?: GateDecisionContext,
  ): Promise<ToolEnforcement>;

  /** Routing-only hint (planner surface). Unroutable when the action is denied. */
  route(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<RoutingHint>;

  /**
   * Seal an out-of-band control-plane event into the SAME durable Merkle chain
   * `decide` writes to (worker-to-backend audit path). Degrade-safe: a
   * governance-unavailable failure surfaces as a rejected promise, never a
   * silently dropped entry.
   */
  recordAudit(entry: AuditEntryInput): Promise<AuditRecord>;

  /** Re-walk the durable audit chain; detects any tampering (tamper-evident). */
  verifyAudit(): Promise<AuditVerification>;
}
