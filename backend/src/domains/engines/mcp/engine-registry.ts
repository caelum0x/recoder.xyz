/**
 * The `IN_PROC_SERVERS` catalog + the wiring-checklist GUARD.
 *
 * `IN_PROC_SERVERS` is the canonical in-proc server catalog the MCP host seeds
 * into its gated registry (registration only — the executable handlers are bound
 * separately). `ENGINE_SERVERS` (in `inproc-router.ts`) is the subset whose tool
 * handlers the engine router owns.
 *
 * `assertWiringComplete()` is the guard that fails boot LOUDLY when a new engine
 * skips a step of the in-proc engine-wiring checklist (the recurring "new MCP
 * engine 404" bug): every `ENGINE_SERVERS` server must (a) be present in
 * `IN_PROC_SERVERS` (so it is in the gated registry) and (b) have a registered
 * in-proc handler for every one of its tools (so an authorized call has an
 * executor). A mismatch throws with the exact missing server/tool.
 */
import {
  githubMcpServer,
  repoMcpServer,
  browserMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  previewMcpServer,
  logsMcpServer,
  ossMcpServer,
  deploymentMcpServer,
  billingMcpServer,
  retrievalMcpServer,
  browserEngineMcpServer,
  coordinationMcpServer,
  workflowMcpServer,
  palPlanMcpServer,
  notifyMcpServer,
} from '@recoder/agent-mcp';
import type { McpServerRegistration } from '@recoder/interop';

/**
 * The canonical in-proc server catalog the host exposes (registration only).
 * MOVED from `agent-os/mcp/interop-host.ts` — the composer seeds these into the
 * gated registry at boot. A server MUST be here to be visible to agents.
 *
 * NOT advertised here: `recoder.tasks` / `recoder.runs` / `recoder.artifacts` /
 * `recoder.approvals` / `recoder.memory`. The engines composer supplies NO binder
 * for them, so their tools (`tasks.create`, `runs.transition`, …) would sit in the
 * gated catalog as `enabled` yet permanently fail on call ("No MCP handler
 * registered"). The real task/run/approval/artifact/memory capability is exposed
 * by the agent-os + memory domains under their OWN serverIds (`agent-os`,
 * `memory`) via `registerDomainTools` at bootstrap — advertising the dead
 * `recoder.*` duplicates would be a false capability claim.
 */
export const IN_PROC_SERVERS: readonly McpServerRegistration[] = [
  githubMcpServer,
  repoMcpServer,
  browserMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  previewMcpServer,
  logsMcpServer,
  ossMcpServer,
  deploymentMcpServer,
  billingMcpServer,
  retrievalMcpServer,
  browserEngineMcpServer,
  coordinationMcpServer,
  workflowMcpServer,
  palPlanMcpServer,
  notifyMcpServer,
];

/** The error a mis-wired engine raises at boot (so the failure is loud + actionable). */
export class EngineWiringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineWiringError';
  }
}

export interface WiringCheckInput {
  /** The registration catalog (`IN_PROC_SERVERS`) seeded into the gated registry. */
  readonly inProcServers: readonly McpServerRegistration[];
  /** The engine servers whose tool handlers the router owns (`ENGINE_SERVERS`). */
  readonly engineServers: readonly McpServerRegistration[];
  /** The registered in-proc handler keys (`${serverId}:${toolName}`). */
  readonly handlerKeys: ReadonlySet<string>;
}

/**
 * Assert the in-proc engine wiring is complete. Throws {@link EngineWiringError}
 * naming the exact gap when:
 *   1. an `ENGINE_SERVERS` server is missing from `IN_PROC_SERVERS` (not in the
 *      gated registry → its tools would 404), or
 *   2. an `ENGINE_SERVERS` tool has no registered in-proc handler (authorized but
 *      no executor → truthful error at call, but we catch it at boot instead).
 * A no-throw return means every engine passed the checklist.
 */
export function assertWiringComplete(input: WiringCheckInput): void {
  const registryIds = new Set(input.inProcServers.map((server) => server.serverId));
  const problems: string[] = [];

  for (const server of input.engineServers) {
    if (!registryIds.has(server.serverId)) {
      problems.push(
        `engine server '${server.serverId}' is in ENGINE_SERVERS but NOT in IN_PROC_SERVERS ` +
          `(add it to the catalog so it is in the gated registry)`,
      );
    }
    for (const toolName of server.toolNames) {
      const key = `${server.serverId}:${toolName}`;
      if (!input.handlerKeys.has(key)) {
        problems.push(
          `engine tool '${key}' has no registered in-proc handler ` +
            `(call buildInProcEngineRouter with the binder that registers it)`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new EngineWiringError(
      `in-proc engine wiring incomplete (${problems.length} problem(s)):\n  - ${problems.join('\n  - ')}`,
    );
  }
}
