/**
 * The napi engine group composer: the typed engine clients
 * (`openfang()`/`tensorzero()`/`governanceKernel()`) + their agent-callable MCP
 * tools + the host registration that binds those tools behind the interop gate.
 *
 * WHY here (not in the deferred module composer): this file owns everything the
 * napi group contributes — the three `EngineClientPort` adapters and the
 * `registerNapiEngineTools(host, clients)` call the (serial) bootstrap wires into
 * `getInteropHostBundle`. Each MCP tool is a thin passthrough to a client's
 * degrade-safe `invoke`, so a `down` engine yields a truthful `{ error, code }`
 * to the agent — never a thrown call, never a fabricated result. Every `.call()`
 * still traverses interop's `authorize → risk → execute → audit` gate first.
 */
import type { Logger } from '../../../../shared/logger.js';
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type { McpToolRegistration } from '../../../../shared/module-base.js';
import type { EngineClientPort } from '../../ports/engine-client.port.js';
import type {
  InProcToolHandler,
  McpHostPort,
  McpServerRegistration,
  McpToolCallInput,
  McpToolResult,
} from '../../ports/mcp-host.port.js';
import type { NapiLoaderPort } from '../../ports/napi-loader.port.js';
import type { InvokeResult } from '../../types.js';
import { msg, type NapiArgs } from './napi-util.js';
import {
  createOpenfangClient,
  type OpenfangNapiAdapter,
  type OpenfangNapiOptions,
} from './openfang-napi.adapter.js';
import {
  createTensorzeroClient,
  type TensorzeroNapiAdapter,
  type TensorzeroNapiOptions,
} from './tensorzero-napi.adapter.js';
import {
  createGovernanceKernelClient,
  type GovernanceNapiAdapter,
} from './governance-napi.adapter.js';

/** A napi engine used behind an MCP tool — the narrow slice the tools call. */
type NapiEngine = EngineClientPort<NapiArgs, unknown>;

/** One agent-callable MCP tool bound to a fixed engine op (or the generic passthrough). */
interface NapiToolSpec {
  readonly name: string;
  readonly description: string;
  /** The engine op this tool invokes. `undefined` → the generic `{ op, ...args }` passthrough. */
  readonly op?: string;
}

/** Map a degrade-safe `InvokeResult` into a plain MCP tool payload (truthful on failure). */
function toToolPayload(result: InvokeResult<unknown>): unknown {
  return result.ok ? result.value : { error: result.reason, ...(result.code ? { code: result.code } : {}) };
}

/** Build `McpToolRegistration[]` for one engine from its tool specs. */
function buildTools(engine: NapiEngine, specs: readonly NapiToolSpec[]): McpToolRegistration[] {
  return specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    handler: async (raw: unknown): Promise<unknown> => {
      const args = (raw ?? {}) as NapiArgs;
      if (spec.op) {
        return toToolPayload(await engine.invoke({ op: spec.op, input: args }));
      }
      // Generic passthrough: `{ op, ...opArgs }` — exposes the full native surface.
      const op = typeof args.op === 'string' ? args.op : '';
      if (!op) return { error: 'op is required (the native method name)' };
      const { op: _op, ...rest } = args;
      return toToolPayload(await engine.invoke({ op, input: rest as NapiArgs }));
    },
  }));
}

// ---------------------------------------------------------------------------
// Tool catalogs (agent-facing names → engine ops)
// ---------------------------------------------------------------------------

const OPENFANG_TOOL_SPECS: readonly NapiToolSpec[] = [
  { name: 'openfang.health', description: 'Openfang kernel health snapshot (in-process).', op: 'health' },
  { name: 'openfang.list_agents', description: 'List openfang agents (id, name, state).', op: 'listAgents' },
  { name: 'openfang.list_models', description: 'List models the openfang kernel can route to.', op: 'listModels' },
  { name: 'openfang.list_skills', description: 'List loaded openfang skills.', op: 'listSkills' },
  { name: 'openfang.list_hands', description: 'List active openfang Hands.', op: 'listActiveHands' },
  { name: 'openfang.bundled_hands', description: 'The Hands compiled into the native addon (pure read, no boot).', op: 'bundledHands' },
  { name: 'openfang.run_agent', description: 'Run one openfang agent turn (governed write). Args: { agentId, message }.', op: 'runAgent' },
  { name: 'openfang.spawn_agent', description: 'Spawn an openfang agent from a manifest (governed write). Args: { manifest }.', op: 'spawnAgent' },
  { name: 'openfang.launch_run', description: 'Conductor runtime driver: one in-process turn emitting RunEvents. Args: { workspaceId, taskId, runId, prompt }.', op: 'launchRun' },
  { name: 'openfang.memory_get', description: "Read an openfang agent's KV memory. Args: { agentId, key }.", op: 'memoryGet' },
  { name: 'openfang.memory_set', description: "Write an openfang agent's KV memory (governed write). Args: { agentId, key, value }.", op: 'memorySet' },
  { name: 'openfang.memory_list', description: "List an openfang agent's KV memory keys. Args: { agentId }.", op: 'memoryList' },
  { name: 'openfang.invoke', description: 'Generic passthrough to any openfang napi op. Args: { op, ...opArgs }.' },
];

const TENSORZERO_TOOL_SPECS: readonly NapiToolSpec[] = [
  { name: 'tensorzero.inference', description: 'Route an inference through the embedded TensorZero gateway (governed). Args: TZ inference params { function_name, input, ... }.', op: 'inference' },
  { name: 'tensorzero.feedback', description: 'Record TensorZero feedback (metric/comment). Args: TZ feedback params.', op: 'feedback' },
  { name: 'tensorzero.config_validate', description: 'Validate a TensorZero config file in-process. Args: { configPath }.', op: 'configValidate' },
  { name: 'tensorzero.version', description: 'The embedded TensorZero gateway crate version.', op: 'version' },
];

const GOVERNANCE_TOOL_SPECS: readonly NapiToolSpec[] = [
  { name: 'governance.status', description: 'Truthful governance kernel status (which rung answers; degraded flag).', op: 'status' },
  { name: 'governance.decide', description: 'Preview a governance decision (deny-biased). Args: { actorId, action, target }.', op: 'decide' },
  { name: 'governance.audit_tip', description: "The governance kernel's current Merkle audit tip hash.", op: 'auditTip' },
  { name: 'governance.audit_verify', description: "Verify the governance kernel's audit chain integrity.", op: 'verifyAudit' },
];

// ---------------------------------------------------------------------------
// Server registrations (seeded into the gated registry by the host)
// ---------------------------------------------------------------------------

function serverFor(serverId: string, displayName: string, specs: readonly NapiToolSpec[]): McpServerRegistration {
  return {
    serverId,
    kind: 'custom',
    displayName,
    transport: 'custom',
    enabled: true,
    toolNames: specs.map((spec) => spec.name),
    // `external:false` routes authorized calls to the in-proc handler (not a stdio process).
    metadata: { external: false, engine: serverId },
  };
}

export const OPENFANG_MCP_SERVER_ID = 'openfang';
export const TENSORZERO_MCP_SERVER_ID = 'tensorzero';
export const GOVERNANCE_KERNEL_MCP_SERVER_ID = 'governance-kernel';

export const openfangMcpServer = serverFor(OPENFANG_MCP_SERVER_ID, 'Openfang (native agent kernel)', OPENFANG_TOOL_SPECS);
export const tensorzeroMcpServer = serverFor(TENSORZERO_MCP_SERVER_ID, 'TensorZero (embedded LLM gateway)', TENSORZERO_TOOL_SPECS);
export const governanceKernelMcpServer = serverFor(GOVERNANCE_KERNEL_MCP_SERVER_ID, 'Governance kernel', GOVERNANCE_TOOL_SPECS);

// ---------------------------------------------------------------------------
// Public MCP tool builders (module-base shape the composer's `mcp()` returns)
// ---------------------------------------------------------------------------

/** openfang agent-callable tools over a client. */
export function buildOpenfangMcpTools(client: NapiEngine): McpToolRegistration[] {
  return buildTools(client, OPENFANG_TOOL_SPECS);
}

/** tensorzero inference/feedback/config/version tools over a client. */
export function buildTensorzeroMcpTools(client: NapiEngine): McpToolRegistration[] {
  return buildTools(client, TENSORZERO_TOOL_SPECS);
}

/** governance kernel read/decide tools over a client (thin — no duplicate of the governance module's tools). */
export function buildGovernanceKernelMcpTools(client: NapiEngine): McpToolRegistration[] {
  return buildTools(client, GOVERNANCE_TOOL_SPECS);
}

/** Every napi-group MCP tool (the composer merges these into `EnginesModule.mcp()`). */
export function buildNapiEngineMcpTools(clients: NapiEngineClients): McpToolRegistration[] {
  return [
    ...buildOpenfangMcpTools(clients.openfang()),
    ...buildTensorzeroMcpTools(clients.tensorzero()),
    ...buildGovernanceKernelMcpTools(clients.governanceKernel()),
  ];
}

// ---------------------------------------------------------------------------
// Engine clients (the typed accessors capability domains hold)
// ---------------------------------------------------------------------------

/** The napi engine clients this group owns. */
export interface NapiEngineClients {
  /** The openfang native kernel client (ConductorRuntime driver + ~51 napi ops). */
  openfang(): OpenfangNapiAdapter;
  /** The tensorzero embedded-gateway client (inference + feedback + config). */
  tensorzero(): TensorzeroNapiAdapter;
  /** The governance kernel client (thin re-expose of the Phase-3 ladder). */
  governanceKernel(): GovernanceNapiAdapter;
}

/** Deps bootstrap injects to build the napi engine clients (no env reads here). */
export interface NapiEngineDeps {
  /** The shared degrade-safe napi loader (supervisor). */
  readonly loader: NapiLoaderPort;
  readonly logger: Logger;
  /** The assembled governance kernel ladder (from the governance module). */
  readonly kernel: GovernanceKernelPort;
  readonly openfang?: OpenfangNapiOptions;
  readonly tensorzero?: TensorzeroNapiOptions;
}

/**
 * Build the napi engine clients (memoized per group instance). Each client is
 * degrade-safe on its own; nothing here reads the environment or dlopen's a
 * second `.node` (the injected loader owns transport binding).
 */
export function createNapiEngineClients(deps: NapiEngineDeps): NapiEngineClients {
  let openfang: OpenfangNapiAdapter | undefined;
  let tensorzero: TensorzeroNapiAdapter | undefined;
  let governance: GovernanceNapiAdapter | undefined;
  return {
    openfang: () => (openfang ??= createOpenfangClient(deps.loader, deps.logger, deps.openfang ?? {})),
    tensorzero: () => (tensorzero ??= createTensorzeroClient(deps.loader, deps.logger, deps.tensorzero ?? {})),
    governanceKernel: () => (governance ??= createGovernanceKernelClient(deps.kernel, deps.logger)),
  };
}

/** The engine clients as the heterogeneous `EngineClientPort` list (registry seeding). */
export function napiEngineClientList(clients: NapiEngineClients): readonly EngineClientPort[] {
  return [clients.openfang(), clients.tensorzero(), clients.governanceKernel()];
}

// ---------------------------------------------------------------------------
// Host registration (the wiring bootstrap calls)
// ---------------------------------------------------------------------------

/** Wrap a module-base tool handler as an interop `InProcToolHandler` (truthful, never throws). */
function asInProcHandler(handler: McpToolRegistration['handler']): InProcToolHandler {
  return async (input: McpToolCallInput): Promise<McpToolResult> => {
    try {
      const content = await handler(input.args);
      return { content, metadata: { external: false } };
    } catch (err) {
      // The gate audits the outcome; a failed handler surfaces a truthful error
      // payload rather than throwing across the executor boundary.
      return { content: { error: msg(err) }, metadata: { external: false, failed: true } };
    }
  };
}

/** The result of wiring the napi engine tools into the host (for the boot wiring report). */
export interface NapiEngineRegistration {
  readonly servers: readonly string[];
  readonly tools: readonly string[];
}

/**
 * Seed the napi engine servers into the gated registry and bind their in-proc
 * tool handlers. This is the ONE call bootstrap makes so the openfang /
 * tensorzero / governance-kernel tools are agent-callable behind the interop
 * gate. Idempotent by (serverId, toolName). Returns what was registered so the
 * composer can include it in the boot wiring report.
 */
export function registerNapiEngineTools(host: McpHostPort, clients: NapiEngineClients): NapiEngineRegistration {
  const groups: Array<{ server: McpServerRegistration; tools: McpToolRegistration[] }> = [
    { server: openfangMcpServer, tools: buildOpenfangMcpTools(clients.openfang()) },
    { server: tensorzeroMcpServer, tools: buildTensorzeroMcpTools(clients.tensorzero()) },
    { server: governanceKernelMcpServer, tools: buildGovernanceKernelMcpTools(clients.governanceKernel()) },
  ];

  const servers: string[] = [];
  const tools: string[] = [];
  for (const { server, tools: toolRegs } of groups) {
    host.registerServer(server);
    servers.push(server.serverId);
    for (const tool of toolRegs) {
      host.registerInProcTool(server.serverId, tool.name, asInProcHandler(tool.handler));
      tools.push(`${server.serverId}:${tool.name}`);
    }
  }
  return { servers, tools };
}
