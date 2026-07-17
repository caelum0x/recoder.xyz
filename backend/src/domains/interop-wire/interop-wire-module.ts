/**
 * `InteropWireComposer` — the Phase-7 composer that layers the dispatch, registry,
 * bridge, and runtime-connector SERVICES on top of the frozen core module
 * (`createInteropWireModule`), wires the A2A JSON-RPC methods, registers the six
 * coding-agent runtime connectors, and exposes the `/api/interop` + `/api/a2a`
 * routers plus the read-only MCP surface.
 *
 * It never edits the frozen core: it consumes `core.transport()/agents()/tasks()/
 * jsonRpc()/agentCard()` and composes around them. Degrade-safe throughout — an
 * absent conductor seam (`localRun`) makes runtime dispatch legs fail truthfully,
 * an absent DB keeps the registry/task projection in-memory (health reports it).
 *
 * Bootstrap integrates this serially (never edited there): it constructs the
 * composer with the persistence executor, the composed auth middleware, and
 * OPTIONALLY the conductor `createWorkspace` seam + a remote-peer sender.
 */
import type { Router } from 'express';
import { Router as makeRouter } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { InteropWireModule, InteropWireModuleDeps } from './index.js';
import { createInteropWireModule } from './index.js';
import { createTaskLifecycleService, type TaskLifecycleService } from './dispatch/task-lifecycle.js';
import {
  createMultiDispatchService,
  type LocalRunDispatchPort,
  type MultiDispatchService,
  type RemoteEnvelopeSender,
} from './dispatch/multi-dispatch.js';
import { registerA2AMethods } from './dispatch/a2a-methods.js';
import { createAgentRegistryService, type AgentRegistryService } from './registry/agent-registry.js';
import { createHeartbeatSloService, type HeartbeatSloService } from './registry/heartbeat-slo.js';
import { createScratchpadService, type ScratchpadService } from './bridge/scratchpad.js';
import { createContextBridgeService, type ContextBridgeService } from './bridge/context-bridge.js';
import { createHandoffService, type HandoffService } from './dispatch/handoff.js';
import { registerRuntimeConnectors } from './runtimes/index.js';
import { buildA2ARoutes } from './routes/a2a.routes.js';
import { createRpcAdmissionGuard } from './routes/rpc-admission.middleware.js';
import { buildAgentsRoutes } from './routes/agents.routes.js';
import { buildTasksRoutes } from './routes/tasks.routes.js';
import { buildInteropMcpTools } from './mcp/interop-engine.js';
import { buildInteropWriteMcpTools } from './mcp/interop-write-engine.js';

/** Dependencies bootstrap injects into the composer (extends the core deps). */
export interface InteropWireComposerDeps extends InteropWireModuleDeps {
  /** The composed identity auth middleware the `/api/interop` edges guard with. */
  readonly middleware: AuthMiddleware;
  /** The owner scope runtime connectors register under + MCP reads default to. */
  readonly ownerId?: string;
  /** Optional conductor `createWorkspace` seam (Phase 5). Absent ⇒ runtime legs error. */
  readonly localRun?: LocalRunDispatchPort;
  /** Optional remote-peer envelope sender. Absent ⇒ remote legs return sealed-only. */
  readonly remoteSender?: RemoteEnvelopeSender;
}

/** The composite surface bootstrap mounts + registers. */
export interface InteropWireComposite {
  readonly name: 'interop-wire';
  /** The frozen core module (transport/envelope/agent-card/jsonRpc/repos). */
  core(): InteropWireModule;
  registry(): AgentRegistryService;
  heartbeat(): HeartbeatSloService;
  taskLifecycle(): TaskLifecycleService;
  dispatch(): MultiDispatchService;
  scratchpad(): ScratchpadService;
  contextBridge(): ContextBridgeService;
  /** The explicit A2A handoff verb (transfer a task + context to another target). */
  handoff(): HandoffService;
  /** The `/api/interop` router (agents + tasks). */
  routes(): Router;
  /** The `/api/a2a` wire router (agent-card + rpc + ingress). */
  wireRoutes(): Router;
  /**
   * The origin-root `/.well-known` router: `GET /agent.json` serves the SAME
   * local agent card as `/api/a2a/agent-card`, at the location RFC 8615 peers
   * probe. Bare card JSON on the wire (the discovery contract), no envelope.
   */
  wellKnownRoutes(): Router;
  /** The read-only MCP tools registered into the interop-gated host. */
  mcp(): readonly McpToolRegistration[];
  health(): ComponentHealth;
  /** Registers runtime connectors + logs posture. Idempotent. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

const SERVICE_OWNER_FALLBACK = 'service:interop-wire';

/** Build the interop-wire composite. Pure factory; degrade-safe by construction. */
export function createInteropWireComposer(deps: InteropWireComposerDeps): InteropWireComposite {
  const core = createInteropWireModule(deps);
  const ownerId = deps.ownerId ?? SERVICE_OWNER_FALLBACK;

  const registry = createAgentRegistryService(core.agents());
  const heartbeat = createHeartbeatSloService({ registry: core.agents(), staleMs: core.config().heartbeatStaleMs });
  const taskLifecycle = createTaskLifecycleService(core.tasks());
  const scratchpad = createScratchpadService(core.tasks());
  const contextBridge = createContextBridgeService({ tasks: core.tasks(), scratchpad });
  const dispatch = createMultiDispatchService({
    transport: core.transport(),
    registry: core.agents(),
    tasks: taskLifecycle,
    ...(deps.localRun ? { localRun: deps.localRun } : {}),
    ...(deps.remoteSender ? { remoteSender: deps.remoteSender } : {}),
  });

  const handoff = createHandoffService({ tasks: taskLifecycle, contextBridge, dispatch, envelope: core.envelope() });

  // Wire the four canonical A2A JSON-RPC methods onto the frozen server.
  registerA2AMethods({ jsonRpc: core.jsonRpc(), tasks: taskLifecycle, dispatch, envelope: core.envelope() });

  let started = false;

  return {
    name: 'interop-wire',
    core: () => core,
    registry: () => registry,
    heartbeat: () => heartbeat,
    taskLifecycle: () => taskLifecycle,
    dispatch: () => dispatch,
    scratchpad: () => scratchpad,
    contextBridge: () => contextBridge,
    handoff: () => handoff,

    routes(): Router {
      const router = makeRouter();
      router.use('/agents', buildAgentsRoutes({ registry, heartbeat, middleware: deps.middleware }));
      router.use('/tasks', buildTasksRoutes({ tasks: taskLifecycle, contextBridge, scratchpad, handoff, middleware: deps.middleware }));
      return router;
    },

    wireRoutes(): Router {
      const cfg = core.config();
      return buildA2ARoutes({
        transport: core.transport(),
        agentCard: core.agentCard(),
        jsonRpc: core.jsonRpc(),
        health: () => core.health(),
        // The publicly-reachable `/rpc` stays governed by the SAME fail-closed
        // signed-ingress posture as `/ingress`: production requires a verified
        // signed envelope wrapping the JSON-RPC call; only the explicit
        // local-dev insecure posture admits bare JSON-RPC.
        rpcAdmission: createRpcAdmissionGuard({
          ingress: core.signedIngress(),
          posture: { requireSigned: cfg.requireSignedIngress, allowInsecure: cfg.allowInsecureIngress },
          logger: deps.logger,
        }),
      });
    },

    wellKnownRoutes(): Router {
      const router = makeRouter();
      router.get('/agent.json', (_req, res) => {
        // Discovery contract: peers expect the bare card at the origin root —
        // no success envelope (unlike the /api/a2a/agent-card operator view).
        res.json(core.agentCard().getLocalAgentCard());
      });
      return router;
    },

    mcp(): readonly McpToolRegistration[] {
      // Read-only introspection tools ++ the governed A2A WRITE tools
      // (send_task / dispatch / respond / inbox). Both pass the host's
      // authorize→risk→policy→audit chain at the MCP boundary.
      return [
        ...buildInteropMcpTools({ registry, heartbeat, tasks: taskLifecycle, contextBridge, jsonRpc: core.jsonRpc(), ownerId }),
        ...buildInteropWriteMcpTools({ dispatch, tasks: taskLifecycle, envelope: core.envelope(), ownerId }),
      ];
    },

    health: () => core.health(),

    async start(): Promise<void> {
      if (started) return;
      started = true;
      // Advertise the six coding-agent runtimes as A2A dispatch targets (degrade-safe).
      await registerRuntimeConnectors(registry, ownerId);
      deps.logger.info(
        { ownerId, localRun: Boolean(deps.localRun), remoteSender: Boolean(deps.remoteSender), methods: core.jsonRpc().methods().length },
        'interop-wire composer started',
      );
    },

    async stop(): Promise<void> {
      // Idempotent, degrade-safe: nothing owned here to drain.
    },
  };
}
