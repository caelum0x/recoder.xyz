/**
 * The governance DECISION-EXPLANATION MCP tool — a self-contained binder for the
 * one composed capability the adapter adds over the existing governance napi
 * surface (no new native export, no `.node` rebuild):
 *
 *   - `governance.explain_decision` → `explain` (actorId SUBJECT): run a real
 *     governance decision and fold it with the routing hint into a rich "why
 *     allow/deny" explanation — an ordered factor list, a one-line summary, the
 *     risk tier + routing view, a truthful confidence flag, the sealing audit
 *     tip, and concrete deny-biased next steps. The "explain the verdict"
 *     capability, composed over the existing `decide()` + `route()` port ops.
 *
 * SECURITY: `explain_decision` keys on `actorId`, a tenant-owned SUBJECT — the
 * identity the decision is evaluated FOR (an unbound handler would let a caller
 * probe "what would ANOTHER actor be allowed to do", a cross-tenant read of the
 * policy posture). This file classifies it as a subject op
 * (`GOVERNANCE_EXPLAIN_SUBJECT_OPS`) and its builder binds every op's args
 * through the caller-scoped {@link ArgsBinder} before the passthrough — the SAME
 * closed cross-tenant rule the rest of the napi engine tools use (a caller can
 * never explain a decision as another tenant's actor). The generic
 * `governance.decide`/`explain` args are bound by the shared governance binder in
 * `napi-engines.ts`, into which this file's subject op is merged.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../../shared/module-base.js';
import type { EngineClientPort } from '../../ports/engine-client.port.js';
import type { InvokeResult } from '../../types.js';
import type { NapiArgs } from './napi-util.js';

/** One explanation tool bound to a fixed engine op. */
export interface GovernanceExplainToolSpec {
  readonly name: string;
  readonly description: string;
  readonly op: string;
}

/** The decision-explanation tool catalog (agent-facing names → composed engine ops). */
export const GOVERNANCE_EXPLAIN_TOOL_SPECS: readonly GovernanceExplainToolSpec[] = [
  {
    name: 'governance.explain_decision',
    description:
      "Rich 'why allow/deny' explanation for a governance decision: effect + risk tier + ordered contributing factors + routing view + truthful confidence + sealing audit tip + next steps. Args: { actorId, action, target, taskId? }.",
    op: 'explain',
  },
];

/**
 * Ops in this group whose `actorId` names a tenant-owned SUBJECT. Merged into the
 * shared governance subject set so BOTH the named tool and any generic passthrough
 * bind the caller's identity (cross-tenant CLOSED).
 */
export const GOVERNANCE_EXPLAIN_SUBJECT_OPS: ReadonlySet<string> = new Set(['explain']);

/** The narrow engine slice these tools call. */
type NapiEngine = EngineClientPort<NapiArgs, unknown>;

/** Rewrite/authorize an op's args against the authorized caller before the passthrough. */
type ArgsBinder = (op: string, args: NapiArgs, caller: McpToolCaller | undefined) => NapiArgs;

/** Map a degrade-safe `InvokeResult` into a plain MCP payload (truthful on failure). */
function toToolPayload(result: InvokeResult<unknown>): unknown {
  return result.ok ? result.value : { error: result.reason, ...(result.code ? { code: result.code } : {}) };
}

/**
 * Build the decision-explanation MCP tool registrations over an engine client.
 * `bind` (the shared governance subject binder) rewrites/authorizes each op's args
 * against the host-authorized caller before the napi passthrough, so a
 * subject-bearing op (`explain`) can never evaluate a decision for another
 * tenant's actor.
 */
export function buildGovernanceExplainMcpTools(engine: NapiEngine, bind: ArgsBinder): McpToolRegistration[] {
  return GOVERNANCE_EXPLAIN_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    handler: async (raw: unknown, caller?: McpToolCaller): Promise<unknown> => {
      const args = (raw ?? {}) as NapiArgs;
      return toToolPayload(await engine.invoke({ op: spec.op, input: bind(spec.op, args, caller) }));
    },
  }));
}
