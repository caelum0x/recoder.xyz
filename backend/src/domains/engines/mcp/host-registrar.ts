/**
 * `registerModuleToolsOnHost` — the BRIDGE between a domain's flat
 * `McpToolRegistration[]` (name/description/handler, returned by its `mcp()`) and
 * the interop-gated host's `serverId + toolNames` catalog model.
 *
 * A capability domain (agent-os / billing / memory / conductor / …) declares its
 * MCP tools as a flat list. The host, however, gates calls off a registered
 * `McpServerRegistration` (whose `toolNames` allowlist the authorize step
 * consults) plus a per-`${serverId}:${toolName}` in-proc handler. This bridge:
 *
 *  1. builds ONE `McpServerRegistration` for the domain from the flat tools'
 *     actual names (so `authorize` sees them in the allowlist), and
 *  2. binds a DELEGATING in-proc handler per tool that the host invokes ONLY
 *     AFTER `authorize → risk` succeed — it hands the validated `input.args` to
 *     the domain handler and normalizes the return into the `{ content, metadata }`
 *     result envelope, then the host `audit`s the outcome.
 *
 * Binding a handler NEVER bypasses the gate: the delegating handler IS the
 * host's "execute" step, run behind `authorize → risk → execute → audit`.
 *
 * Degrade-safe: an absent host is a truthful no-op + warn (never a fabricated
 * registration); an empty serverId or empty tool list is a truthful skip.
 */
import type { Logger } from '../../../shared/logger.js';
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type {
  McpHostPort,
  McpServerRegistration,
  McpToolCallInput,
  McpToolResult,
  EdgeBoundToolCallInput,
} from '../ports/mcp-host.port.js';

/**
 * Project the EDGE-BOUND authenticated caller onto the {@link McpToolCaller} a
 * domain handler binds its mutation subject to.
 *
 * SECURITY: `actor.agentId` is caller-controlled at the HTTP edge (free-form
 * request body), so it MUST NOT decide the tenant subject — trusting it lets a
 * caller spoof a victim's tenant (cross-tenant provision/destroy/domain abuse).
 * The edge instead threads the AUTHENTICATED principal as `input.caller`
 * (`userId`/`orgId`/`scopes`); prefer it, carrying the real org + scopes so a
 * handler's admin/internal and org-membership logic operate on true values.
 * Only for a TRUSTED internal/direct call (no edge, so no bound `caller`) do we
 * fall back to `actor.agentId`. An empty identity yields `undefined` so the
 * handler refuses rather than guesses.
 */
function callerFromInput(input: McpToolCallInput): McpToolCaller | undefined {
  const bound = (input as EdgeBoundToolCallInput).caller;
  const boundUserId = typeof bound?.userId === 'string' ? bound.userId.trim() : '';
  if (boundUserId) {
    return {
      userId: boundUserId,
      ...(bound?.orgId ? { orgId: bound.orgId } : {}),
      ...(bound?.scopes ? { scopes: bound.scopes } : {}),
    };
  }
  const userId = typeof input.actor?.agentId === 'string' ? input.actor.agentId.trim() : '';
  if (!userId) return undefined;
  return { userId };
}

/** Truthful, auditable outcome of a module-tool registration. */
export interface ModuleToolsRegistration {
  /** The server id the tools were registered under. */
  readonly serverId: string;
  /** The tool names bound behind the gate (empty when skipped). */
  readonly registered: readonly string[];
  /** True when nothing was registered (host absent, empty id, or no tools). */
  readonly skipped: boolean;
  /** Truthful reason when skipped. */
  readonly reason?: string;
}

/** Build the interop server descriptor for a domain's flat tool list. */
function buildServerRegistration(
  serverId: string,
  tools: readonly McpToolRegistration[],
): McpServerRegistration {
  return {
    serverId,
    kind: 'custom',
    displayName: serverId,
    transport: 'custom',
    enabled: true,
    toolNames: tools.map((tool) => tool.name),
    metadata: { external: false },
  };
}

/**
 * Wrap a domain's flat handler (`(args, caller?) => result`) as a gated in-proc
 * handler (`(McpToolCallInput) => McpToolResult`). The host runs this ONLY after
 * the call is authorized; it passes the validated `input.args` plus the
 * host-authorized {@link McpToolCaller} through, and normalizes the domain return
 * into the `{ content, metadata }` result envelope.
 */
function delegatingHandler(
  serverId: string,
  tool: McpToolRegistration,
): (input: McpToolCallInput) => Promise<McpToolResult> {
  return async (input: McpToolCallInput): Promise<McpToolResult> => {
    const content = await tool.handler(input.args, callerFromInput(input));
    return { content, metadata: { serverId, toolName: tool.name, external: false } };
  };
}

/**
 * Register a domain's flat `mcp()` tools into the gated host under `serverId`:
 * register the server descriptor, then bind a delegating handler per tool.
 * Returns a truthful registration record (bootstrap logs/audits it).
 */
export function registerModuleToolsOnHost(
  host: McpHostPort | null,
  serverId: string,
  tools: readonly McpToolRegistration[],
  logger: Logger,
): ModuleToolsRegistration {
  const id = serverId.trim();
  if (!id) {
    logger.warn('engines host-registrar: empty serverId; module tools NOT registered');
    return { serverId, registered: [], skipped: true, reason: 'empty serverId' };
  }
  if (!host) {
    logger.warn(
      { serverId: id },
      'engines host-registrar: MCP host absent; module tools NOT registered (degrade-safe no-op)',
    );
    return { serverId: id, registered: [], skipped: true, reason: 'host absent' };
  }
  if (tools.length === 0) {
    logger.debug({ serverId: id }, 'engines host-registrar: no tools to register');
    return { serverId: id, registered: [], skipped: true, reason: 'no tools' };
  }

  host.registerServer(buildServerRegistration(id, tools));
  const registered: string[] = [];
  for (const tool of tools) {
    host.registerInProcTool(id, tool.name, delegatingHandler(id, tool));
    registered.push(tool.name);
  }
  logger.info(
    { serverId: id, tools: registered },
    'engines host-registrar: registered module MCP tools into the gated host',
  );
  return { serverId: id, registered, skipped: false };
}
