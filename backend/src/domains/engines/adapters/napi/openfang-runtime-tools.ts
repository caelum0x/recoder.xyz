/**
 * The openfang AGENT-RUNTIME introspection MCP tools — a self-contained binder
 * for the two composed capabilities the adapter adds over the existing napi
 * surface (no new native export, no `.node` rebuild):
 *
 *   - `openfang.introspect_hands` → `introspectHands` (global read): every Hand
 *     definition joined with its tools/skills/MCP allowlist AND its live
 *     instances. The "list hands + their tools" capability.
 *   - `openfang.agent_run_status` → `agentRunStatus` (agentId SUBJECT): a folded
 *     run-status snapshot (state + context report + session usage/cost + session
 *     list) for one agent.
 *
 * SECURITY: `agent_run_status` keys on `agentId`, a tenant-owned subject. This
 * file classifies it as a subject op (`OPENFANG_RUNTIME_SUBJECT_OPS`) and its
 * builder binds every op's args through the caller-scoped {@link ArgsBinder}
 * before the passthrough — the SAME closed cross-tenant rule the rest of the
 * openfang tools use (a caller can never name another tenant's agent). The
 * generic `openfang.invoke` passthrough is covered separately by the shared
 * subject set in `napi-engines.ts`, into which this file's subject op is merged.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../../shared/module-base.js';
import type { EngineClientPort } from '../../ports/engine-client.port.js';
import type { InvokeResult } from '../../types.js';
import type { NapiArgs } from './napi-util.js';

/** One runtime-introspection tool bound to a fixed engine op. */
export interface OpenfangRuntimeToolSpec {
  readonly name: string;
  readonly description: string;
  readonly op: string;
}

/** The runtime-introspection tool catalog (agent-facing names → composed engine ops). */
export const OPENFANG_RUNTIME_TOOL_SPECS: readonly OpenfangRuntimeToolSpec[] = [
  {
    name: 'openfang.introspect_hands',
    description:
      'Rich hand + tool introspection: every openfang Hand definition joined with its tools, skills, MCP allowlist and live instances. Args: {}.',
    op: 'introspectHands',
  },
  {
    name: 'openfang.agent_run_status',
    description:
      "One agent's run-status snapshot: state + context report + session usage/cost + session list, degrading each read independently. Args: { agentId }.",
    op: 'agentRunStatus',
  },
];

/**
 * Ops in this group whose `agentId` names a tenant-owned SUBJECT. Merged into the
 * shared openfang subject set so BOTH the named tool and the generic
 * `openfang.invoke` passthrough bind the caller's identity (cross-tenant CLOSED).
 */
export const OPENFANG_RUNTIME_SUBJECT_OPS: ReadonlySet<string> = new Set(['agentRunStatus']);

/** The narrow engine slice these tools call. */
type NapiEngine = EngineClientPort<NapiArgs, unknown>;

/** Rewrite/authorize an op's args against the authorized caller before the passthrough. */
type ArgsBinder = (op: string, args: NapiArgs, caller: McpToolCaller | undefined) => NapiArgs;

/** Map a degrade-safe `InvokeResult` into a plain MCP payload (truthful on failure). */
function toToolPayload(result: InvokeResult<unknown>): unknown {
  return result.ok ? result.value : { error: result.reason, ...(result.code ? { code: result.code } : {}) };
}

/**
 * Build the runtime-introspection MCP tool registrations over an engine client.
 * `bind` (the shared openfang subject binder) rewrites/authorizes each op's args
 * against the host-authorized caller before the napi passthrough, so a
 * subject-bearing op (`agentRunStatus`) can never select another tenant's agent.
 */
export function buildOpenfangRuntimeMcpTools(engine: NapiEngine, bind: ArgsBinder): McpToolRegistration[] {
  return OPENFANG_RUNTIME_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    handler: async (raw: unknown, caller?: McpToolCaller): Promise<unknown> => {
      const args = (raw ?? {}) as NapiArgs;
      return toToolPayload(await engine.invoke({ op: spec.op, input: bind(spec.op, args, caller) }));
    },
  }));
}
