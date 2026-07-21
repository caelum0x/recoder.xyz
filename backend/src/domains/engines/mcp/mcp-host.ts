/**
 * `InteropHostBundle` — the interop-gated MCP host facade. MOVED (behind the
 * composer) from `agent-os/mcp/interop-host.ts`.
 *
 * This is the ONE place the backend constructs the `@recoder/interop` `McpHost`,
 * seeds it with the canonical in-proc catalog (`IN_PROC_SERVERS`), registers the
 * REAL external Python `pal-mcp-server` over supervised stdio-MCP, and delegates
 * authorized in-proc calls into the engine router. Every `.call()` traverses
 * interop's `authorize → risk → execute → audit` gate BEFORE any process is
 * touched.
 *
 * DECOUPLED from agent-os: instead of importing the agent-os repository /
 * conductor internals, the concrete engines are injected as router BINDERS
 * (`buildInProcEngineRouter(binders)`). The deep-engine agents supply the binders
 * (their `register*McpTools(router, deps)` calls); this CORE only wires the gate.
 *
 * FROZEN registration API (agent-os + conductor + every capability domain build
 * against this): `registerServer`, `registerInProcTool`, `registerExternalServer`,
 * `authorize`, `call`, `listServers`, `getServer`.
 */
import { resolve } from 'node:path';
import {
  McpHost,
  ExternalMcpProcessManager,
  buildPalServerConfig,
  palServerAvailability,
  GovernanceDeniedError,
  PAL_SERVER_ID,
  type ExternalMcpServerConfig,
  type ExternalServerHealth,
  type HostCallOutcome,
  type McpAuditSinkPort,
  type McpToolAuditEvent,
  type McpServerRegistration,
} from '@recoder/interop';
import type { McpToolCallInput, McpToolResult } from '@recoder/agent-mcp';
import { McpToolRouter, McpRegistry } from '@recoder/agent-mcp';
import type {
  McpHostPort,
  InProcToolHandler,
  EdgeBoundToolCallInput,
} from '../ports/mcp-host.port.js';
import type { ToolExecEnforcementPort } from '../../governance/ports/tool-exec-gate.port.js';
import type { GateDecisionContext } from '../../governance/types.js';
import type { Principal } from '../../identity/types.js';
import {
  forEachInProcEngineTool,
  ENGINE_SERVERS,
  type EngineToolBinder,
} from './inproc-router.js';
import { IN_PROC_SERVERS, assertWiringComplete } from './engine-registry.js';

/**
 * Derive the enforcement subject from the EDGE-BOUND authenticated caller, never
 * the caller-controlled `actor.agentId`. The `caller` field is the authenticated
 * principal the MCP HTTP edge binds (`userId/orgId/scopes`, projected from a real
 * `Principal`). Absent caller (trusted internal call or unauthenticated) ⇒ a
 * synthetic anonymous principal — the kernel's forbidden-path / secret-path
 * classifier is identity-independent for hard blocks, so deny-bias holds.
 */
function principalFromCall(input: McpToolCallInput): Principal {
  const caller = (input as EdgeBoundToolCallInput).caller;
  if (caller) {
    return {
      userId: caller.userId,
      ...(caller.orgId ? { orgId: caller.orgId } : {}),
      scopes: caller.scopes ?? [],
      // The MCP edge authenticates the bridge over an sk_ platform key; the
      // `McpToolCaller` projection keeps userId/orgId/scopes but not the credential
      // sub-kind, so enforcement records `apikey` provenance for the audit row.
      kind: 'apikey',
      isAnonymous: false,
      raw: null,
    };
  }
  return {
    userId: 'anonymous',
    scopes: [],
    kind: 'anonymous',
    isAnonymous: true,
    raw: null,
  };
}

/** Build the gate decision context (task correlation + the governed tool target). */
function gateCtxFromCall(input: McpToolCallInput, toolName: string): GateDecisionContext {
  const taskId = input.task?.taskId;
  return {
    target: { toolName },
    ...(taskId ? { taskId } : {}),
  };
}

/**
 * The executor the interop host runs AFTER authorization. It routes external
 * (supervised stdio) servers through their real process over MCP `tools/call`,
 * and dispatches in-proc servers to a registered handler. An in-proc tool with
 * no registered handler surfaces a truthful error — never a faked result.
 *
 * THE PER-TOOL TEETH: when a `toolEnforcer` is injected, the fine-grained kernel
 * enforcement runs HERE — after interop `authorize → risk` (upstream in
 * `InteropMcpHost.call`) and BEFORE any in-proc `handler(input)` / external
 * `transport.call`. This is the ONE chokepoint every recoder-MCP-server tool call
 * traverses. A `denied` verdict throws {@link GovernanceDeniedError} (fail-closed:
 * the inner engine/process is never touched); the deny is already Merkle-sealed by
 * `gate.enforceTool`. Absent enforcer ⇒ truthful pass-through (never a fake-allow).
 *
 * COVERAGE BOUNDARY (truthful): these teeth gate the recoder-MCP tool stream ONLY
 * — including the high-side-effect `sandbox_exec` / `workspace_merge` tools. They
 * do NOT see a launched coding agent's OWN in-worktree bash/file/secret ops, which
 * never cross this executor and stay under conductor's coarse
 * `guardConductorWrite → decide`. A strict improvement over the previously-ungated
 * MCP surface, not full per-tool coverage of the agent's native side effects.
 */
function createInteropExecutor(
  external: ExternalMcpProcessManager,
  inProcHandlers: ReadonlyMap<string, InProcToolHandler>,
  toolEnforcer?: ToolExecEnforcementPort,
) {
  return {
    async call(input: McpToolCallInput): Promise<McpToolResult> {
      const registration = input.server;
      if (toolEnforcer) {
        const toolName = `${registration.serverId}.${input.toolName}`;
        const verdict = await toolEnforcer.enforce({
          toolName,
          rawArgs: input.args,
          principal: principalFromCall(input),
          ctx: gateCtxFromCall(input, toolName),
        });
        if (verdict.outcome === 'denied') {
          // Fail-closed: block BEFORE dispatch. `gate.enforceTool` has already
          // sealed the authoritative deny into the Merkle chain; the interop
          // `try/catch` maps this throw to a non-`completed` (`'failed'`) wire row.
          throw new GovernanceDeniedError(toolName, verdict.reason);
        }
      }
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
      if (handler) return handler(input);
      throw new Error(
        `No in-proc executor wired for ${registration.serverId}:${input.toolName} in backend.`,
      );
    },
  };
}

export interface InteropHostBundleOptions {
  /** Absolute path to the cloned `backend/engines/py/pal-mcp-server`. Defaults to `engines/py/pal-mcp-server`. */
  readonly palRootDir?: string;
  /** Durable audit sink (e.g. agent-events outbox). Optional → in-memory only. */
  readonly auditSink?: McpAuditSinkPort;
  /** Env overlay for the PAL process (e.g. provider keys, injected by bootstrap). */
  readonly palEnv?: Readonly<Record<string, string>>;
  /**
   * The engine-tool binders the deep-engine agents supply. Each registers a
   * server's REAL handlers over its concrete engine (`(r) => registerBeadsMcpTools(r, deps)`).
   * Absent → the host still exposes the gated registry, but engine tools 404
   * truthfully until binders are wired.
   */
  readonly engineBinders?: readonly EngineToolBinder[];
  /** Extra external servers to register beyond PAL (supervised stdio-MCP). */
  readonly externalServers?: readonly ExternalMcpServerConfig[];
  /**
   * Fail boot when the wiring-checklist guard finds a gap (default `false`: log
   * only). The composer sets this `true` in production so a mis-wired engine is
   * caught loudly. Tests leave it `false`.
   */
  readonly enforceWiring?: boolean;
  /** Called with the wiring problems when the guard fails and `enforceWiring` is false. */
  readonly onWiringWarning?: (err: unknown) => void;
  /**
   * The per-tool governance teeth (bound from `governance.toolExecGate()`),
   * injected by bootstrap. When present, EVERY authorized tool call runs the
   * fine-grained kernel enforcement at the executor chokepoint before dispatch;
   * a denial fails closed (throws {@link GovernanceDeniedError}, sealed by the
   * gate). Absent (tests / standalone) ⇒ truthful pass-through — never a
   * fake-allow. See the coverage boundary on {@link createInteropExecutor}.
   */
  readonly toolEnforcer?: ToolExecEnforcementPort;
}

/** The PAL server descriptor surfaced to control routes with truthful health. */
export interface PalServerStatus {
  readonly serverId: string;
  readonly config: ExternalMcpServerConfig;
  readonly available: boolean;
  readonly reason?: string;
  readonly pythonPath: string;
  readonly serverEntry: string;
  readonly health: ExternalServerHealth;
}

export class InteropHostBundle implements McpHostPort {
  readonly host: McpHost;
  private readonly external: ExternalMcpProcessManager;
  private readonly palRootDir: string;
  private readonly inProcHandlers = new Map<string, InProcToolHandler>();

  constructor(options: InteropHostBundleOptions = {}) {
    this.external = new ExternalMcpProcessManager();
    this.host = new McpHost(
      {
        executor: createInteropExecutor(
          this.external,
          this.inProcHandlers,
          options.toolEnforcer,
        ),
        ...(options.auditSink ? { auditSink: options.auditSink } : {}),
      },
      this.external,
    );
    this.palRootDir =
      options.palRootDir ?? resolve(process.cwd(), 'engines', 'py', 'pal-mcp-server');

    // Seed the canonical in-proc catalog (registration only — handlers bound below).
    for (const server of IN_PROC_SERVERS) {
      this.host.registry.register(server);
    }

    // Register the REAL external PAL server (registration always succeeds; the
    // process is lazy; health stays truthful when the python env is absent).
    const palConfig = buildPalServerConfig({
      rootDir: this.palRootDir,
      ...(options.palEnv ? { env: options.palEnv } : {}),
    });
    this.host.registerExternalServer(palConfig);
    for (const config of options.externalServers ?? []) {
      this.host.registerExternalServer(config);
    }

    // Bind the concrete engines behind the runtime-agnostic in-proc servers via
    // the injected binders. Authorized in-proc calls delegate into the real router.
    this.bindInProcEngines(options.engineBinders ?? []);

    // Wiring-checklist guard: catch a mis-registered engine at boot, not at call.
    this.checkWiring(options);
  }

  private bindInProcEngines(binders: readonly EngineToolBinder[]): void {
    if (binders.length === 0) return;
    // Build the engine router over a registry we can INSPECT, so a delegating
    // in-proc handler is bound ONLY for servers a binder actually registered.
    // An `ENGINE_SERVERS` server with no supplied binder must NOT get a fake
    // delegating handler: doing so both advertises a tool that silently fails on
    // call ("No MCP handler registered") AND fools the wiring guard (its
    // `handlerKeys` would falsely cover every engine tool). Leaving it unbound
    // makes the gap surface truthfully — the guard flags it at boot.
    const registry = new McpRegistry();
    const engineRouter = new McpToolRouter(registry);
    for (const bind of binders) {
      try {
        bind(engineRouter);
      } catch {
        /* isolate a broken binder; its tools stay unbound + are flagged by the guard */
      }
    }
    const boundServerIds = new Set(registry.list().map((server) => server.serverId));
    forEachInProcEngineTool((serverId, toolName) => {
      if (!boundServerIds.has(serverId)) return;
      this.registerInProcTool(serverId, toolName, (input) => engineRouter.call(input));
    });
  }

  private checkWiring(options: InteropHostBundleOptions): void {
    // Only enforce when binders were supplied (an empty host is intentionally bare).
    if ((options.engineBinders ?? []).length === 0) return;
    try {
      assertWiringComplete({
        inProcServers: IN_PROC_SERVERS,
        engineServers: ENGINE_SERVERS,
        handlerKeys: new Set(this.inProcHandlers.keys()),
      });
    } catch (err) {
      if (options.enforceWiring) throw err;
      options.onWiringWarning?.(err);
    }
  }

  // --- McpHostPort ---

  registerServer(server: McpServerRegistration): void {
    this.host.registry.register(server);
  }

  registerInProcTool(serverId: string, toolName: string, handler: InProcToolHandler): void {
    this.inProcHandlers.set(`${serverId}:${toolName}`, handler);
  }

  registerExternalServer(config: ExternalMcpServerConfig): void {
    this.host.registerExternalServer(config);
  }

  listServers(): McpServerRegistration[] {
    return this.host.registry.list();
  }

  getServer(serverId: string): McpServerRegistration | null {
    return this.host.registry.get(serverId);
  }

  authorize(input: McpToolCallInput): ReturnType<McpHost['authorize']> {
    return this.host.authorize(input);
  }

  call(input: McpToolCallInput): Promise<HostCallOutcome> {
    return this.host.call(input);
  }

  /** Truthful PAL server status: on-disk availability + live supervisor health. */
  palStatus(): PalServerStatus {
    const availability = palServerAvailability({ rootDir: this.palRootDir });
    const config = buildPalServerConfig({ rootDir: this.palRootDir });
    const health =
      this.host.externalHealth().find((entry) => entry.serverId === PAL_SERVER_ID) ?? {
        serverId: PAL_SERVER_ID,
        state: 'stopped' as const,
        healthy: false,
        detail: 'Not registered.',
      };
    return {
      serverId: PAL_SERVER_ID,
      config,
      available: availability.available,
      ...(availability.reason ? { reason: availability.reason } : {}),
      pythonPath: availability.pythonPath,
      serverEntry: availability.serverEntry,
      health,
    };
  }
}

export type { McpToolAuditEvent };

let sharedBundle: InteropHostBundle | null = null;

/**
 * The process-wide interop host bundle. Constructed once so the gated registry,
 * sessions, and external supervisor are stable across requests. Tests construct
 * their own {@link InteropHostBundle} directly.
 */
export function getInteropHostBundle(options?: InteropHostBundleOptions): InteropHostBundle {
  if (!sharedBundle) sharedBundle = new InteropHostBundle(options);
  return sharedBundle;
}

/** Test seam: drop the process-wide bundle so the next `get` rebuilds it. */
export function __resetInteropHostBundleForTest(): void {
  sharedBundle = null;
}
