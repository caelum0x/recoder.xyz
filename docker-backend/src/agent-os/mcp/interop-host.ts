import { resolve } from 'node:path';
import {
  McpHost,
  ExternalMcpProcessManager,
  buildPalServerConfig,
  palServerAvailability,
  PAL_SERVER_ID,
  type ExternalMcpServerConfig,
  type ExternalServerHealth,
  type HostCallOutcome,
  type McpAuditSinkPort,
  type McpToolAuditEvent,
  type McpServerRegistration,
} from '@recoder/interop';
import type { McpToolCallInput, McpToolResult } from '@recoder/agent-mcp';
import { McpToolRouter } from '@recoder/agent-mcp';
import { agentOsContainer } from '../service-container';
import type { AgentOsRepository } from '../repositories/agent-os.repository';
import {
  buildInProcEngineRouter,
  forEachInProcEngineTool,
} from './inproc-engines';
import {
  billingMcpServer,
  browserMcpServer,
  tasksMcpServer,
  runsMcpServer,
  artifactsMcpServer,
  approvalsMcpServer,
  deploymentMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  githubMcpServer,
  logsMcpServer,
  memoryMcpServer,
  ossMcpServer,
  previewMcpServer,
  repoMcpServer,
} from '@recoder/agent-mcp';

/**
 * docker-backend's adoption seam for the `@recoder/interop` MCP host.
 *
 * This is the ONE place the running backend constructs the interop `McpHost`
 * facade, seeds it with the canonical in-proc server catalog, and registers the
 * REAL external Python `py/pal-mcp-server` over supervised stdio MCP. Every tool
 * call routed through {@link InteropHostBundle.call} traverses interop's
 * authorize → risk → execute → audit gate before any process is touched.
 *
 * It is ADDITIVE: the existing `/api/mcp` routes keep their behavior. The new
 * interop-backed routes call into this bundle. Nothing here fakes success — an
 * absent Python venv yields a registered-but-unhealthy PAL server with a
 * truthful reason, never a fabricated "ready".
 */

/** The canonical in-proc server catalog the host exposes (registration only). */
const IN_PROC_SERVERS: McpServerRegistration[] = [
  tasksMcpServer,
  runsMcpServer,
  artifactsMcpServer,
  approvalsMcpServer,
  githubMcpServer,
  repoMcpServer,
  browserMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  previewMcpServer,
  logsMcpServer,
  ossMcpServer,
  deploymentMcpServer,
  billingMcpServer,
];

/**
 * The executor the interop host runs AFTER authorization succeeds. It routes
 * external (supervised stdio) servers through their real process over MCP
 * `tools/call`, and dispatches in-proc servers to a registered handler. An
 * in-proc tool with no registered handler surfaces a truthful error
 * (authorized-but-no-executor) — never a faked result.
 */
function createInteropExecutor(
  external: ExternalMcpProcessManager,
  inProcHandlers: ReadonlyMap<string, InProcToolHandler>,
) {
  return {
    async call(input: McpToolCallInput): Promise<McpToolResult> {
      const registration = input.server;
      const isExternal = registration.metadata?.external === true;
      if (isExternal) {
        const transport = await external.ensureStarted(registration.serverId);
        if (!transport) {
          throw new Error(`External MCP server not registered: ${registration.serverId}`);
        }
        if (transport.state !== 'ready') {
          throw new Error(
            `External MCP server '${registration.serverId}' is ${transport.state}; cannot execute '${input.toolName}'.`,
          );
        }
        const result = await transport.call('tools/call', {
          name: input.toolName,
          arguments: input.args,
        });
        return { content: result, metadata: { external: true, serverId: registration.serverId } };
      }
      const handler = inProcHandlers.get(`${registration.serverId}:${input.toolName}`);
      if (handler) {
        return handler(input);
      }
      throw new Error(
        `No in-proc executor wired for ${registration.serverId}:${input.toolName} in docker-backend.`,
      );
    },
  };
}

/**
 * A registered in-proc tool handler: the real execution behind an authorized
 * call for an in-proc server. Keyed by `${serverId}:${toolName}` at registration
 * time via {@link InteropHostBundle.registerInProcTool}.
 */
export type InProcToolHandler = (input: McpToolCallInput) => Promise<McpToolResult> | McpToolResult;

export interface InteropHostBundleOptions {
  /** Absolute path to the cloned `py/pal-mcp-server`. Defaults to repo `py/pal-mcp-server`. */
  readonly palRootDir?: string;
  /** Durable audit sink (e.g. agent-events outbox). Optional → in-memory only. */
  readonly auditSink?: McpAuditSinkPort;
  /** Env overlay for the PAL process (e.g. provider keys from the host env). */
  readonly palEnv?: Readonly<Record<string, string>>;
  /**
   * Canonical agent-os store backing the in-proc tasks/runs MCP tools. Defaults
   * to the live `agentOsContainer.repository` so MCP task/run reads + writes hit
   * the SAME store of record as the rest of the control plane. Injectable for
   * tests with an in-memory repository.
   */
  readonly repository?: AgentOsRepository;
  /**
   * Base directory the git_nexus repo-root resolver resolves relative repos
   * against (mirrors the conductor's `repoPath` base). Defaults to
   * `CONDUCTOR_REPO_ROOT` / `process.cwd()` inside the engine binding.
   */
  readonly baseRepoRoot?: string;
}

/** The PAL server descriptor surfaced to control routes with truthful health. */
export interface PalServerStatus {
  readonly serverId: string;
  readonly config: ExternalMcpServerConfig;
  /** On-disk availability of the python env (degrade-safe, never faked). */
  readonly available: boolean;
  readonly reason?: string;
  readonly pythonPath: string;
  readonly serverEntry: string;
  /** Live supervisor health (lazy: "stopped/not started" until first call). */
  readonly health: ExternalServerHealth;
}

/**
 * A fully-wired interop MCP host bundle: the facade, its catalog-gated registry,
 * and the registered external PAL server. Returned to the route layer so it can
 * authorize/list/call without knowing how the host is composed.
 */
export class InteropHostBundle {
  readonly host: McpHost;
  private readonly palRootDir: string;
  private readonly inProcHandlers = new Map<string, InProcToolHandler>();

  constructor(options: InteropHostBundleOptions = {}) {
    const external = new ExternalMcpProcessManager();
    this.host = new McpHost(
      {
        executor: createInteropExecutor(external, this.inProcHandlers),
        auditSink: options.auditSink,
      },
      external,
    );
    this.palRootDir =
      options.palRootDir ?? resolve(process.cwd(), '..', 'py', 'pal-mcp-server');

    // Seed the canonical in-proc catalog (registration only).
    for (const server of IN_PROC_SERVERS) {
      this.host.registry.register(server);
    }

    // Register the REAL external PAL server. Registration always succeeds (it is
    // trusted control-plane state); the process is NOT started here (lazy), and
    // its health stays truthful if the python env is absent.
    const palConfig = buildPalServerConfig({ rootDir: this.palRootDir, env: options.palEnv });
    this.host.registerExternalServer(palConfig);

    // Wire the CONCRETE engines behind the runtime-agnostic git_nexus/tasks/runs
    // MCP servers: the recodergit indexer over the resolved repo root, and the
    // canonical agent-os store for task/run state. Authorized in-proc calls for
    // these tools are delegated into the package's real handlers — the engines
    // are injected, not the package fakes.
    this.bindInProcEngines(
      options.repository ?? agentOsContainer.repository,
      options.baseRepoRoot,
    );
  }

  /**
   * Build the engine-backed `McpToolRouter` and register a delegating in-proc
   * handler per engine tool. The interop gate still runs first
   * (authorize → risk → audit); only AFTER authorization does the bundle invoke
   * the real router, which executes the concrete recodergit / agent-os engine.
   */
  private bindInProcEngines(repository: AgentOsRepository, baseRepoRoot?: string): void {
    const engineRouter: McpToolRouter = buildInProcEngineRouter(repository, { baseRepoRoot });
    forEachInProcEngineTool((serverId, toolName) => {
      this.registerInProcTool(serverId, toolName, (input) => engineRouter.call(input));
    });
  }

  /**
   * Register the real execution handler for an in-proc tool. The server must be
   * in the gated registry (it is, for the canonical catalog); the handler runs
   * ONLY after the interop gate authorizes the call. This is how concrete tool
   * logic is bound to the host without bypassing the authorize→audit gate.
   */
  registerInProcTool(serverId: string, toolName: string, handler: InProcToolHandler): void {
    this.inProcHandlers.set(`${serverId}:${toolName}`, handler);
  }

  /** Every server visible to agents (in-proc + external), from the gated registry. */
  listServers(): McpServerRegistration[] {
    return this.host.registry.list();
  }

  /** Look up one server registration by id from the gated registry. */
  getServer(serverId: string): McpServerRegistration | null {
    return this.host.registry.get(serverId);
  }

  /** AUTHORIZE only — the pure decision (registry + risk + agent-policy intent). */
  authorize(input: McpToolCallInput) {
    return this.host.authorize(input);
  }

  /** Full gated call: authorize → risk → execute → audit. */
  call(input: McpToolCallInput): Promise<HostCallOutcome> {
    return this.host.call(input);
  }

  /** Truthful PAL server status: on-disk availability + live supervisor health. */
  palStatus(): PalServerStatus {
    const availability = palServerAvailability({ rootDir: this.palRootDir });
    const config = buildPalServerConfig({ rootDir: this.palRootDir });
    const health = this.host
      .externalHealth()
      .find((entry) => entry.serverId === PAL_SERVER_ID) ?? {
      serverId: PAL_SERVER_ID,
      state: 'stopped' as const,
      healthy: false,
      detail: 'Not registered.',
    };
    return {
      serverId: PAL_SERVER_ID,
      config,
      available: availability.available,
      reason: availability.reason,
      pythonPath: availability.pythonPath,
      serverEntry: availability.serverEntry,
      health,
    };
  }
}

export type { McpToolAuditEvent };

let sharedBundle: InteropHostBundle | null = null;

/**
 * The process-wide interop host bundle. Constructed once and reused so the
 * catalog-gated registry, sessions, and external supervisor are stable across
 * requests. Tests construct their own {@link InteropHostBundle} directly.
 */
export function getInteropHostBundle(options?: InteropHostBundleOptions): InteropHostBundle {
  if (!sharedBundle) {
    sharedBundle = new InteropHostBundle(options);
  }
  return sharedBundle;
}
