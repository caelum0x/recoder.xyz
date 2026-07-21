/**
 * `ToolExecEnforcementPort` — the NARROW, least-authority per-tool teeth seam.
 *
 * This is the one facet the engines MCP host consumes to gate a live tool call
 * WITHOUT importing the full {@link GovernanceGate}. It is bound from the gate's
 * `enforceTool` (deny-biased + Merkle-sealed) by {@link createToolExecGate}.
 *
 * COVERAGE BOUNDARY (truthful — do not overclaim): these teeth gate the
 * recoder-MCP-server tool stream at the interop executor chokepoint ONLY —
 * including the high-side-effect `sandbox_exec` / `workspace_merge` tools. They
 * do NOT see a launched coding agent's OWN in-worktree `bash`/file/secret ops,
 * which never cross the executor and stay under conductor's coarse
 * `guardConductorWrite → decide`. This is a strict improvement over the
 * previously-ungated MCP surface, not full per-tool coverage of an agent's
 * native side effects.
 */
import type { Principal } from '../../identity/types.js';
import type { GateDecisionContext } from '../types.js';

/** The input to a single per-tool enforcement check. */
export interface ToolExecEnforceInput {
  /** `${serverId}.${toolName}` — the governed name the kernel classifier sees. */
  readonly toolName: string;
  /**
   * The raw tool arguments. Projected to a secret-free string INSIDE the port
   * ({@link createToolExecGate}) before it reaches the kernel — never logged raw,
   * never sealed raw (only its length lands in the audit row).
   */
  readonly rawArgs: unknown;
  /**
   * The subject the check runs under — derived from the edge-bound authenticated
   * caller, NEVER the caller-controlled `actor.agentId`.
   */
  readonly principal: Principal;
  /** Task/run correlation + workspace root when the caller knows them. */
  readonly ctx?: GateDecisionContext;
}

/** The outcome of a single per-tool enforcement check. */
export interface ToolEnforcementOutcome {
  readonly outcome: 'allowed' | 'denied';
  readonly reason: string;
  /** True whenever the backing kernel did NOT use the in-proc napi path. */
  readonly degraded: boolean;
  /** Which path answered: `'napi' | 'daemon' | 'ts' | 'synthetic'`. */
  readonly engine: string;
}

/**
 * The per-tool teeth. Deny-biased + Merkle-sealed by the backing
 * `gate.enforceTool`: an infrastructure fault yields a synthetic DENY (never a
 * fabricated allow), and every allow/deny is sealed into the durable audit chain.
 */
export interface ToolExecEnforcementPort {
  enforce(input: ToolExecEnforceInput): Promise<ToolEnforcementOutcome>;
}
