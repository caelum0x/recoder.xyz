/**
 * `McpHostPort` — the interop-gated MCP host facade every OTHER domain consumes
 * to register + call tools. It is the ONE place agent-os, conductor, and every
 * capability domain register their `mcp()` tools; every `.call()` traverses
 * interop's `authorize → risk → execute → audit` chain before any handler runs.
 *
 * This port re-exports the interop wire types (`HostCallOutcome`,
 * `McpToolCallInput`, `McpServerRegistration`) so consumers depend on the domain
 * seam, not directly on `@recoder/interop`. The concrete impl is
 * `mcp/mcp-host.ts` (`InteropHostBundle`) which wraps `@recoder/interop`'s
 * `McpHost`.
 */
import type {
  HostCallOutcome,
  McpServerRegistration,
  ExternalMcpServerConfig,
} from '@recoder/interop';
import type { McpToolCallInput, McpToolResult } from '@recoder/agent-mcp';
import type { McpToolCaller } from '../../../shared/module-base.js';

export type { HostCallOutcome, McpServerRegistration, McpToolCallInput, McpToolResult };

/**
 * A gated call input carrying the EDGE-BOUND authenticated caller.
 *
 * SECURITY: `McpToolCallInput.actor.agentId` is caller-controlled at the HTTP
 * edge (free-form request body). It MUST NOT be trusted as the tenant subject an
 * in-proc handler acts for. The edge instead threads the AUTHENTICATED principal
 * (`userId`/`orgId`/`scopes`) as this `caller` field, which the interop host
 * passes through unchanged to the executor. In-proc handlers (via the
 * host-registrar) derive their {@link McpToolCaller} from this bound field, never
 * from `actor.agentId`. Absent ⇒ trusted internal call (no edge) or unauthenticated.
 */
export interface EdgeBoundToolCallInput extends McpToolCallInput {
  readonly caller?: McpToolCaller;
}

/**
 * A registered in-proc tool handler: the real execution behind an authorized
 * call, keyed `${serverId}:${toolName}`. Runs ONLY after the interop gate
 * authorizes the call — binding a handler never bypasses authorize→audit.
 */
export type InProcToolHandler = (
  input: McpToolCallInput,
) => Promise<McpToolResult> | McpToolResult;

export interface McpHostPort {
  /** Every server visible to agents (in-proc + external), from the gated registry. */
  listServers(): McpServerRegistration[];

  /** Look up one server registration by id (null when not registered). */
  getServer(serverId: string): McpServerRegistration | null;

  /**
   * Register an in-proc server descriptor into the gated registry. Idempotent by
   * server id. The handlers for its tools are bound via `registerInProcTool`.
   */
  registerServer(server: McpServerRegistration): void;

  /**
   * Bind the concrete execution for one in-proc tool. The server must already be
   * in the gated registry; the handler runs only after authorization. This is
   * the seam agent-os/conductor/every capability domain uses to wire their real
   * tool logic into the host.
   */
  registerInProcTool(serverId: string, toolName: string, handler: InProcToolHandler): void;

  /**
   * Register a REAL external (supervised stdio-MCP) server. Registration always
   * succeeds (trusted control-plane state); the process starts lazily and its
   * health stays truthful when the sidecar is absent.
   */
  registerExternalServer(config: ExternalMcpServerConfig): void;

  /** AUTHORIZE only — the pure decision (registry + risk + policy), no execution. */
  authorize(input: McpToolCallInput): unknown;

  /** Full gated call: authorize → risk → execute → audit. */
  call(input: McpToolCallInput): Promise<HostCallOutcome>;
}
