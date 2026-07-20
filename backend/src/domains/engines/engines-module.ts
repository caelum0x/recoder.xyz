/**
 * `EnginesComposer` — the composer that fuses the multi-language engine seam into
 * one module. It:
 *  - slices the injected `AppConfig` into `EnginesConfig` (no env reads here),
 *  - builds the three supervisors (napi loader / daemon / sidecar) over ONE shared
 *    `ProcessRegistry`,
 *  - constructs the DEEP per-engine adapters behind the frozen `EngineClientPort`:
 *    napi (openfang / tensorzero / governance-kernel) over the shared loader
 *    (CONFLICT #8-safe: ONE `.node` load), daemon (colbert / ops-recorder /
 *    multica / ziti) over the shared supervisor, sidecar (mem0 / browser-use /
 *    pal-mcp) over the shared sidecar supervisor, and cli (beads / tmux / dmux /
 *    recodergit),
 *  - builds the interop-gated MCP host (`InteropHostBundle`) seeded with the
 *    canonical catalog + this domain's own engine binders (beads / browser-use /
 *    pal-plan), leaving agent-os + conductor to add theirs at bootstrap,
 *  - exposes the typed engine clients + the host + truthful per-engine health.
 *
 * No `process.env` reads (config is injected; the napi loader owns its own default
 * env accessor). No top-level singletons. Every path is degrade-safe: an absent
 * `.node` / daemon binary / uv venv / CLI leaves that engine `down` with a reason,
 * never a faked `up`; a missing DB no-ops the health registry.
 */
import { Router } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Logger } from '../../shared/logger.js';
import {
  sliceEnginesConfig,
  isEngineEnabled,
  daemonEnvFor,
  type EnginesConfig,
} from './config.js';
import {
  ENGINE_IDS,
  ENGINE_TRANSPORTS,
  DEFAULT_LOOPBACK,
  isRestartable,
  isEngineId,
} from './constants.js';
import {
  down,
  fail,
  type EngineDescriptor,
  type EngineHealth,
  type EngineId,
} from './types.js';
import type { EngineClientPort } from './ports/engine-client.port.js';
import type {
  EngineRegistryPort,
  EngineHealthRepository,
  McpHostPort,
} from './ports/index.js';
import { NapiLoader } from './supervisor/napi-loader.js';
import { ProcessRegistry } from './supervisor/process-registry.js';
import { DaemonSupervisor } from './supervisor/daemon-supervisor.js';
import { SidecarSupervisor } from './supervisor/sidecar-supervisor.js';
import { PgEngineHealthRepository } from './adapters/engine-health.repository.js';
import {
  createNapiEngineClients,
  registerNapiEngineTools,
  TensorzeroNapiAdapter,
  type NapiEngineClients,
  type NapiEngineRegistration,
} from './adapters/napi/index.js';
import {
  ColbertLoopbackAdapter,
  OpsRecorderLoopbackAdapter,
  MulticaLoopbackAdapter,
  ZitiRestAdapter,
  buildColbertMcpTools,
  buildColbertIndexMcpTools,
  opsRecorderSignalsMcpServer,
  buildOpsRecorderSignalsMcpTools,
  type DaemonAdapterConfig,
} from './adapters/daemon/index.js';
import {
  Mem0Adapter,
  BrowserUseAdapter,
  PalMcpAdapter,
  browserUseEngineBinder,
  browserSessionEngineBinder,
  palPlanEngineBinder,
  palCommsEngineBinder,
} from './adapters/sidecar/index.js';
import {
  BeadsAdapter,
  TmuxAdapter,
  DmuxAdapter,
  RecodergitAdapter,
  beadsEngineBinder,
} from './adapters/cli/index.js';
import type { TmuxIntrospectPort } from './adapters/cli/index.js';
import {
  createRecoderGitService,
  type RecoderGitService,
} from './recodergit-service.js';
import { createOpenfangProvenanceGate } from './agent-engine/provenance-gate.js';
import { createAgentEngineService } from './agent-engine/agent-engine.service.js';
import type { AgentEngineService } from './ports/agent-engine.port.js';
import type { OpenfangProvenanceGate } from './openfang-runtime.js';
import {
  GithubModule,
  githubEngineBinder,
  repoEngineBinder,
} from './github/index.js';
import { InteropHostBundle } from './mcp/mcp-host.js';
import {
  buildEnginesMcpTools,
  enginesMcpServer,
} from './mcp/engines-engine.js';
import {
  buildMem0MemoryMcpTools,
  mem0MemoryMcpServer,
} from './mcp/mem0-memory.mcp.js';
import {
  buildRecodergitIntelMcpTools,
  recodergitIntelMcpServer,
  type RecodergitIntelOp,
} from './mcp/recodergit-intel.mcp.js';
import {
  buildTmuxIntrospectMcpTools,
  tmuxIntrospectMcpServer,
} from './mcp/tmux-introspect.mcp.js';
import {
  buildBeadsGraphMcpTools,
  beadsGraphMcpServer,
} from './mcp/beads-graph.mcp.js';
import { browserExtEngineBinder } from './mcp/browser-ext-engine.js';
import { tensorzeroInferenceEngineBinder } from './mcp/tensorzero-inference-engine.js';
import { dmuxLayoutEngineBinder } from './mcp/dmux-layout-engine.js';
import {
  registerModuleToolsOnHost,
  callerFromInput,
  type ModuleToolsRegistration,
} from './mcp/host-registrar.js';
import {
  gitNexusEngineBinder,
  workflowEngineBinder,
  notifyEngineBinder,
  createEnginesWorkflowEngine,
} from './mcp/capability-binders.js';
import { InProcLogStore, logsEngineBinder } from './mcp/logs-store.js';
import {
  createNotifyEngine,
  type NotifyEngine,
  type NotifyFetch,
} from '@recoder/agent-notify';
import type { WorkflowEngine } from '@recoder/workflow-engine';
import {
  registerDomainToolsOnHost,
  type DomainToolsRegistration,
} from './adapters/domain-tools-bridge.adapter.js';
import {
  buildMcpEdgeRouter,
  buildInternalEnginesRouter,
  type RestartOutcome,
} from './routes/mcp-edge.routes.js';
import { buildEnginesHealth } from './health.js';
import type { EnginesModule, EnginesModuleDeps } from './index.js';

/** Build the static declared-engine descriptors from the closed engine catalog. */
function buildDescriptors(): readonly EngineDescriptor[] {
  return ENGINE_IDS.map(id => {
    const transport = ENGINE_TRANSPORTS[id];
    return {
      id,
      transport,
      title: id,
      restartable: isRestartable(transport),
      // napi/cli engines + externally-managed daemons are expected-absent degrades.
      optional: true,
    };
  });
}

/** A tiny in-memory declared-engine catalog (capability discovery surface). */
class InMemoryEngineRegistry implements EngineRegistryPort {
  private readonly descriptors: readonly EngineDescriptor[];
  private readonly byId: ReadonlyMap<EngineId, EngineDescriptor>;

  constructor(descriptors: readonly EngineDescriptor[]) {
    this.descriptors = descriptors;
    this.byId = new Map(
      descriptors.map(descriptor => [descriptor.id, descriptor])
    );
  }

  list(): readonly EngineDescriptor[] {
    return this.descriptors;
  }

  get(id: EngineId): EngineDescriptor | null {
    return this.byId.get(id) ?? null;
  }

  byTransport(
    transport: EngineDescriptor['transport']
  ): readonly EngineDescriptor[] {
    return this.descriptors.filter(
      descriptor => descriptor.transport === transport
    );
  }
}

export class EnginesComposer implements EnginesModule {
  readonly name = 'engines' as const;

  private readonly log: Logger;
  private readonly cfg: EnginesConfig;
  private readonly executor: QueryExecutor;
  private readonly middleware: AuthMiddleware;
  private readonly registryImpl: EngineRegistryPort;
  private readonly healthRepo: EngineHealthRepository;
  private readonly napiClients: NapiEngineClients;
  /**
   * The ONE openfang provenance gate — built from the injected kernel, shared into
   * BOTH the napi adapter's `launch_run` option (MCP path) AND the agent-engine
   * facet's direct `run()` path (substrate). Never double-constructed.
   */
  private readonly openfangGate: OpenfangProvenanceGate;
  /** The cohesive openfang agent-engine facet (memoized). */
  private agentEngineFacet: AgentEngineService | null | undefined;
  private readonly daemonSupervisor: DaemonSupervisor;
  private readonly sidecarSupervisor: SidecarSupervisor;
  private readonly adapters: ReadonlyMap<EngineId, EngineClientPort>;
  private readonly recodergitService: RecoderGitService;
  private readonly githubModule: GithubModule;
  /** The OWNED capability engines behind the previously-unbound catalog servers. */
  private readonly logStore: InProcLogStore;
  private readonly workflowEngine: WorkflowEngine;
  private readonly notifyEngine: NotifyEngine;
  private readonly hostBundle: InteropHostBundle;
  private hostReady = false;
  private napiRegistration: NapiEngineRegistration | null = null;
  private started = false;

  constructor(deps: EnginesModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceEnginesConfig(deps.config, deps.overrides ?? {});
    this.executor = deps.executor;
    this.middleware = deps.middleware;

    this.registryImpl = new InMemoryEngineRegistry(buildDescriptors());
    this.healthRepo = new PgEngineHealthRepository(this.executor, this.log);

    // ONE shared process registry backs both supervisors (no double-spawn).
    const processRegistry = new ProcessRegistry(this.log);
    this.daemonSupervisor = new DaemonSupervisor(processRegistry, this.log);
    this.sidecarSupervisor = new SidecarSupervisor(processRegistry, this.log);

    // The napi group over the ONE shared loader (CONFLICT #8-safe single `.node`).
    const napiLoader = new NapiLoader(this.log, {
      repoRoot: this.cfg.repoRoot,
    });
    // Build the ONE provenance gate from the injected kernel, then thread it into
    // the adapter's `launch_run` option (MCP path). The SAME instance is handed to
    // the agent-engine facet below for its direct `run()` path (substrate) — never
    // double-constructed, so every fresh spawn is gated regardless of surface.
    this.openfangGate = createOpenfangProvenanceGate(deps.kernel);
    this.napiClients = createNapiEngineClients({
      loader: napiLoader,
      logger: this.log,
      kernel: deps.kernel,
      openfang: { governance: this.openfangGate },
    });

    // ONE shared recodergit service backs both the CLI adapter and the unified
    // GitHub module, so freshness/health state is a single source of truth.
    this.recodergitService = createRecoderGitService();
    this.adapters = this.buildAdapters();

    // The unified GitHub module: gh CLI + recodergit facets, ONE GithubHealth.
    this.githubModule = new GithubModule({
      log: this.log,
      repoRoot: this.cfg.repoRoot ?? null,
      recodergit: this.recodergitService,
    });

    // The OWNED capability engines behind the catalog servers that were advertised
    // but had NO in-proc handler ("No in-proc executor wired"): a bounded in-proc
    // log ring, the workflow+hooks engine, and the notify webhook engine. Each is
    // degrade-safe; the notify engine is injected by bootstrap (shared with
    // observability) or built here with global fetch (truthful `not_configured`
    // until a webhook is configured).
    this.logStore = new InProcLogStore();
    this.workflowEngine = createEnginesWorkflowEngine({
      repoRoot: this.cfg.repoRoot ?? null,
    });
    this.notifyEngine =
      deps.notifyEngine ??
      createNotifyEngine({ fetch: globalThis.fetch as unknown as NotifyFetch });

    // The interop-gated MCP host, seeded with THIS domain's engine binders. The
    // wiring guard logs (does not throw) for servers agent-os/conductor still bind.
    this.hostBundle = new InteropHostBundle({
      ...(this.cfg.palRootDir ? { palRootDir: this.cfg.palRootDir } : {}),
      engineBinders: [
        // `recoder.beads` (ready/show/create/…/remember/recall) as thin delegates
        // over the ONE beads transport — the same adapter seam the `beads-graph`
        // query server binds (single `bd` spawner + argv owner).
        beadsEngineBinder(this.adapters.get('beads') ?? null),
        browserUseEngineBinder(),
        // `recoder.browser` (open/snapshot/verify) over the SUPERVISED sidecar
        // adapter — the fix for the "advertised but 404 on call" gap.
        browserSessionEngineBinder(this.adapters.get('browser-use') ?? null),
        // `recoder.browser-use.ext` (extract_structured/run_task/screenshot_annotate/
        // fill_form) over the DEEP browser-use capability surface (`adapter.ext()`).
        browserExtEngineBinder(
          (
            this.adapters.get('browser-use') as BrowserUseAdapter | undefined
          )?.ext() ?? null
        ),
        // `recoder.tensorzero` (model_catalog/batch_inference) over the DEEP
        // TensorZero inference surface (`adapter.inference()`) — the two NEW
        // capabilities on top of the existing single-inference napi tools.
        tensorzeroInferenceEngineBinder(
          (
            this.adapters.get('tensorzero') as TensorzeroNapiAdapter | undefined
          )?.inference() ?? null
        ),
        // `recoder.dmux` (layout_presets/panes_list/panes_create/layout_apply) over
        // the DEEP dmux pane/layout surface (`adapter.layout()`) — programmatic
        // arrangement of a multi-agent workspace view on the shared tmux substrate.
        dmuxLayoutEngineBinder(
          (this.adapters.get('dmux') as DmuxAdapter | undefined)?.layout() ??
            null
        ),
        palPlanEngineBinder(),
        // `recoder.pal-comms` (route/consensus/debate/models) over the pal adapter.
        palCommsEngineBinder(this.adapters.get('pal-mcp') ?? null),
        githubEngineBinder(this.githubModule),
        repoEngineBinder({ repoRoot: this.cfg.repoRoot ?? null }),
        // The four previously-dead catalog servers, now bound over REAL engines:
        // `recoder.git_nexus.*` (recodergit indexer), `recoder.logs.*` (in-proc
        // ring), `recoder.workflow.*` (workflow+hooks), `recoder.notify.notify.send`.
        gitNexusEngineBinder({ repoRoot: this.cfg.repoRoot ?? null }),
        logsEngineBinder(this.logStore),
        workflowEngineBinder(this.workflowEngine),
        notifyEngineBinder(this.notifyEngine),
      ],
      // Surface an advertised-but-unbound engine server LOUDLY at boot (WARN),
      // not silently on first call: a server left in ENGINE_SERVERS without a
      // supplied binder has no in-proc handler, so its tools fail truthfully.
      // Not a hard `enforceWiring` throw — boot stays resilient — but the gap is
      // now visible in logs instead of only when an agent calls the dead tool.
      onWiringWarning: err =>
        this.log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'engines MCP host: advertised engine server(s) have no bound handler — their tools will fail on call until a binder is supplied'
        ),
    });
    this.hostReady = true;
  }

  /** Construct the DEEP per-engine adapters behind the frozen `EngineClientPort`. */
  private buildAdapters(): ReadonlyMap<EngineId, EngineClientPort> {
    const map = new Map<EngineId, EngineClientPort>();

    // --- napi (in-process `.node`) ---
    map.set('openfang', this.napiClients.openfang());
    map.set('tensorzero', this.napiClients.tensorzero());
    map.set('governance', this.napiClients.governanceKernel());

    // --- daemon (supervised loopback HTTP) ---
    map.set(
      'colbert',
      new ColbertLoopbackAdapter(
        this.daemonSupervisor,
        this.daemonCfg('colbert'),
        this.log
      )
    );
    map.set(
      'ops-recorder',
      new OpsRecorderLoopbackAdapter(
        this.daemonSupervisor,
        this.daemonCfg('ops-recorder'),
        this.log
      )
    );
    map.set(
      'multica',
      new MulticaLoopbackAdapter(
        this.daemonSupervisor,
        this.daemonCfg('multica'),
        this.log
      )
    );
    map.set('ziti', new ZitiRestAdapter(this.daemonCfg('ziti'), this.log));

    // --- sidecar (uv venv; stdio-MCP / loopback HTTP) ---
    map.set(
      'mem0',
      new Mem0Adapter({
        supervisor: this.sidecarSupervisor,
        config: this.cfg,
        log: this.log,
      })
    );
    map.set(
      'browser-use',
      new BrowserUseAdapter({
        supervisor: this.sidecarSupervisor,
        config: this.cfg,
        log: this.log,
      })
    );
    map.set(
      'pal-mcp',
      new PalMcpAdapter({
        supervisor: this.sidecarSupervisor,
        config: this.cfg,
        log: this.log,
        ...(Object.keys(this.cfg.palEnv).length > 0
          ? { palEnv: this.cfg.palEnv }
          : {}),
      })
    );

    // --- cli (one-shot subprocess) ---
    map.set('beads', new BeadsAdapter({ config: this.cfg, log: this.log }));
    map.set('tmux', new TmuxAdapter({ config: this.cfg, log: this.log }));
    map.set('dmux', new DmuxAdapter({ config: this.cfg, log: this.log }));
    map.set(
      'recodergit',
      new RecodergitAdapter({
        config: this.cfg,
        log: this.log,
        service: this.recodergitService,
      })
    );

    return map;
  }

  /** Project the narrowed daemon-adapter config for one daemon engine (no env reads). */
  private daemonCfg(
    id: 'colbert' | 'ops-recorder' | 'multica' | 'ziti'
  ): DaemonAdapterConfig {
    const listenAddr = DEFAULT_LOOPBACK[id];
    // The MINIMAL child env overlay (colbert PATH/ninja, ops-recorder auth flag,
    // multica keys) — bootstrap-injected, secret-minimal, NEVER `process.env`.
    const childEnv = daemonEnvFor(this.cfg, id);
    return {
      enabled: isEngineEnabled(this.cfg, id),
      externalUrl: this.cfg.externalUrls[id] ?? null,
      binOverride: this.cfg.daemonBins[id] ?? null,
      ...(listenAddr ? { listenAddr } : {}),
      ...(Object.keys(childEnv).length > 0 ? { childEnv } : {}),
    };
  }

  client(id: EngineId): EngineClientPort | null {
    return this.adapters.get(id) ?? null;
  }

  /**
   * The LIVE loopback base URL a supervised engine publishes once it has come up
   * (`http://127.0.0.1:PORT`), or the operator's external URL, or `null` when the
   * engine is not (yet) reachable. Consumers that speak raw HTTP fold this in;
   * consumers on the typed seam prefer `client(id)`. NB: with fire-and-forget
   * spawn-on-boot, this is `null` until the engine's first health passes, so
   * consumers should read it lazily (re-probe), not cache a one-shot snapshot.
   */
  endpoint(id: EngineId): string | null {
    const daemon = this.daemonSupervisor.handle(id);
    if (daemon?.baseUrl) return daemon.baseUrl;
    const sidecar = this.sidecarSupervisor.handle(id);
    if (sidecar?.baseUrl) return sidecar.baseUrl;
    const external = (this.cfg.externalUrls as Record<string, string | null>)[
      id
    ];
    return external ?? null;
  }

  tensorzero(): EngineClientPort | null {
    return this.client('tensorzero');
  }

  /**
   * The cohesive openfang agent-engine facet (docs/modules/agent-engine.md).
   * Pure verbs compose over the ONE napi transport (`OpenfangNapiAdapter`); the
   * two streaming verbs (run/continueRun) compose over the sibling
   * `launchOpenfangRun` function seam so a per-call RunEvent sink can be threaded.
   * The provenance gate — the SAME instance wired into the adapter's `launch_run`
   * option — is pre-wired on the facet's `run()` path. Null only when the openfang
   * engine is undeclared (always declared here ⇒ always non-null in practice).
   */
  agentEngine(): AgentEngineService | null {
    if (this.agentEngineFacet !== undefined) return this.agentEngineFacet;
    const engine = this.adapters.get('openfang') ?? null;
    this.agentEngineFacet = engine
      ? createAgentEngineService({ engine, gate: this.openfangGate, logger: this.log })
      : null;
    return this.agentEngineFacet;
  }

  /**
   * The DEEP, read-only tmux introspection port over the pinned tmux binary — the
   * same seam the `tmux.*` MCP tools bind over (`bindTmuxIntrospectMcpTools`). The
   * conductor's reconcile-GC substrate scan reads `listSessions()` here to see the
   * REAL live `recoder-*` sessions on the box. Null when the tmux adapter is not
   * declared (truthful skip — never a fabricated port).
   */
  tmuxIntrospect(): TmuxIntrospectPort | null {
    const tmux = this.adapters.get('tmux') as TmuxAdapter | undefined;
    return tmux ? tmux.introspect() : null;
  }

  /**
   * The unified GitHub module — the ONE `GithubHealth` source (gh CLI +
   * recodergit facets) and the engine behind the `github.*` MCP tools.
   */
  github(): GithubModule {
    return this.githubModule;
  }

  registry(): EngineRegistryPort {
    return this.registryImpl;
  }

  host(): McpHostPort {
    return this.hostBundle;
  }

  /**
   * Bridge: register a capability domain's flat `mcp()` tools into the gated host
   * under `serverId`. Bootstrap calls this once per domain that exposes `mcp()`
   * (agent-os / billing / memory / conductor / observability / …) so those tools
   * become agent-callable behind interop's `authorize → risk → execute → audit`
   * gate. Degrade-safe: an unready host yields a truthful no-op + warn.
   */
  registerModuleTools(
    serverId: string,
    tools: readonly McpToolRegistration[]
  ): ModuleToolsRegistration {
    return registerModuleToolsOnHost(
      this.hostReady ? this.hostBundle : null,
      serverId,
      tools,
      this.log
    );
  }

  /**
   * COLLISION-SAFE bridge (preferred): register one domain's flat `mcp()` tools
   * into the gated host under `serverId`, first-registration-wins. A serverId
   * already in the gated registry, or a duplicate tool name in `tools`, is
   * logged + skipped truthfully; an empty tool list is a no-op. The handlers run
   * in-process, invoked by the host ONLY after `authorize → risk` succeed —
   * exactly the same gated route the engine tools traverse.
   */
  registerDomainTools(
    serverId: string,
    tools: readonly McpToolRegistration[]
  ): DomainToolsRegistration {
    const results = registerDomainToolsOnHost(
      this.hostReady ? this.hostBundle : null,
      [{ serverId, tools }],
      this.log
    );
    return (
      results[0] ?? {
        serverId,
        registered: [],
        skipped: true,
        reason: 'no registration attempted',
        collisions: [],
      }
    );
  }

  /** Truthful live health for every declared engine (an unbound engine is `down`). */
  async listHealth(): Promise<readonly EngineHealth[]> {
    const readings = await Promise.all(
      ENGINE_IDS.map(async (id): Promise<EngineHealth> => {
        const adapter = this.adapters.get(id);
        if (!adapter) {
          // Declared but not constructed here (e.g. tensorzero-loopback lives in
          // the inference module). Truthful `down`, never a faked `up`.
          return down(
            id,
            ENGINE_TRANSPORTS[id],
            'no adapter bound in engines composer'
          );
        }
        try {
          return await adapter.health();
        } catch (err) {
          return down(
            id,
            ENGINE_TRANSPORTS[id],
            `health probe error: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      })
    );
    // Best-effort durable snapshot; no-ops without a pool.
    void this.recordHealth(readings);
    return readings;
  }

  private async recordHealth(readings: readonly EngineHealth[]): Promise<void> {
    if (!this.healthRepo.isDurable()) return;
    await Promise.all(
      readings.map(async reading => {
        try {
          await this.healthRepo.recordHealth(reading);
        } catch {
          /* degrade-safe: durable snapshot is best-effort */
        }
      })
    );
  }

  /**
   * The domain router mounted at `/api/mcp` (the engines mountBase):
   *  - GET  /engines, GET /engines/health — read-only declared-engine surface,
   *  - GET  /servers                       — the gated MCP registry catalog,
   *  - POST /tools/:server/:tool/call      — the governed edge the agents'
   *    stdio bridge calls (interop gate: authorize → risk → execute → audit),
   *  - POST /call                          — same call, server/tool in the body,
   *  - POST /engines/:id/restart           — governed restart (admin-gated).
   */
  routes(): Router {
    const router = Router();
    router.get('/engines', this.middleware.authenticate, (_req, res) => {
      res.json({ engines: this.registryImpl.list() });
    });
    router.get('/engines/health', this.middleware.authenticate, (_req, res) => {
      void this.listHealth().then(engines => res.json({ engines }));
    });
    // The governed MCP HTTP edge — every tool call traverses the interop gate
    // via `host.call()`; this router never executes a handler itself.
    router.use(
      buildMcpEdgeRouter({
        host: this.hostBundle,
        mw: this.middleware,
        log: this.log,
        restartEngine: (id, requestedBy, reason) =>
          this.restartEngineById(id, requestedBy, reason),
      })
    );
    return router;
  }

  /** The `INTERNAL_SERVICE_KEY`-gated worker surface (`/internal/engines`). */
  internalRoutes(): Router {
    return buildInternalEnginesRouter({
      mw: this.middleware,
      listHealth: () => this.listHealth(),
    });
  }

  /**
   * The ONE restart path (shared by the MCP `engine.restart` tool and the HTTP
   * edge). Truthful outcomes: a napi/CLI engine is `skipped` (not restartable),
   * a failed stop/start surfaces `failed` + reason — never a faked restart.
   */
  private async restartEngineById(
    id: EngineId,
    requestedBy: string,
    reason?: string
  ): Promise<RestartOutcome> {
    const descriptor = this.registryImpl.get(id);
    if (!descriptor || !descriptor.restartable) {
      return { outcome: 'skipped', reason: 'not restartable' };
    }
    const adapter = this.adapters.get(id);
    if (!adapter) return { outcome: 'skipped', reason: 'no adapter bound' };
    try {
      await adapter.stop();
      await adapter.start();
      const record = {
        engineId: id,
        requestedBy,
        outcome: 'restarted' as const,
        ...(reason ? { reason } : {}),
      };
      void this.healthRepo.recordRestart(record).catch(() => undefined);
      return { outcome: 'restarted' };
    } catch (err) {
      return {
        outcome: 'failed',
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  mcp(): readonly McpToolRegistration[] {
    return buildEnginesMcpTools({
      listDescriptors: () => this.registryImpl.list(),
      listHealth: () => this.listHealth().then(readings => readings),
      engineHealth: async id => {
        const adapter = this.adapters.get(id);
        if (!adapter) return null;
        return adapter.health();
      },
      restart: (id, requestedBy, reason) =>
        this.restartEngineById(id, requestedBy, reason),
    });
  }

  async health(): Promise<ComponentHealth> {
    const engines = await this.listHealth();
    return buildEnginesHealth({
      engines,
      hostReady: this.hostReady,
      registryDurable: this.healthRepo.isDurable(),
    });
  }

  /**
   * Boot: register the napi engine tools into the host, SPAWN every supervised
   * daemon/sidecar (fire-and-forget), and log posture. Idempotent.
   *
   * The napi (`.node`) engines are already in-process (loaded in the ctor) and
   * the CLI engines are one-shot, so only the daemon/sidecar transports need a
   * boot spawn. It is dispatched fire-and-forget (`void Promise.allSettled`) so
   * the 30s-per-engine `waitForHealthy` NEVER blocks boot — health surfaces
   * truthfully via `listHealth()` as each engine comes up (or stays `down`).
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Seed the `engines` server + bind the napi engine tools behind the gate.
    this.hostBundle.registerServer(enginesMcpServer);
    // Bind THIS domain's own `engine.list` / `engine.health` / `engine.restart`
    // handlers into the host. Bootstrap's `registerDomainTools` loop intentionally
    // SKIPS the engines domain (it self-registers here), so without this the three
    // tools sat in the gated catalog with no executor ("No in-proc executor wired
    // for engines:…"). Registered as gated delegating handlers, not re-registering
    // the (already-seeded) server descriptor.
    this.bindEnginesMcpTools();
    // Bind the DEEP daemon/sidecar MCP servers that self-register directly on the
    // host (not via IN_PROC_SERVERS/ENGINE_SERVERS binders): mem0 memory insights,
    // ops-recorder signals query/stats, and the colbert base + index-management
    // servers. Each is gated (authorize → risk → execute → audit) and degrade-safe.
    this.bindMem0MemoryMcpTools();
    this.bindRecodergitIntelMcpTools();
    this.bindTmuxIntrospectMcpTools();
    this.bindBeadsGraphMcpTools();
    this.bindOpsRecorderSignalsMcpTools();
    const colbert = this.adapters.get('colbert');
    if (colbert) {
      // The collision-safe bridge registers the server descriptor from the tool
      // names AND binds delegating gated handlers (threading `callerFromInput` so
      // the create/drop identity-gating fires). base colbert (rerank/search) +
      // the batch/index-management server were both previously unwired.
      this.registerDomainTools('colbert', buildColbertMcpTools(colbert));
      this.registerDomainTools(
        'colbert-index',
        buildColbertIndexMcpTools(colbert)
      );
    }
    this.napiRegistration = registerNapiEngineTools(
      this.hostBundle,
      this.napiClients
    );
    if (this.cfg.spawnOnBoot) this.spawnSupervisedOnBoot();
    const engines = await this.listHealth();
    this.log.info(
      {
        declared: ENGINE_IDS.length,
        bound: this.adapters.size,
        up: engines.filter(engine => engine.status === 'up').length,
        napiServers: this.napiRegistration.servers,
        hostReady: this.hostReady,
        spawnOnBoot: this.cfg.spawnOnBoot,
      },
      'engines module started'
    );
  }

  /**
   * Bind the engines-domain `mcp()` tools (`engine.list` / `engine.health` /
   * `engine.restart`) as gated delegating in-proc handlers on the already-seeded
   * `engines` server. Mirrors the host-registrar delegating shape (the host runs
   * each ONLY after `authorize → risk`, then audits the outcome) without
   * re-registering the server descriptor.
   */
  private bindEnginesMcpTools(): void {
    for (const tool of this.mcp()) {
      this.hostBundle.registerInProcTool(
        enginesMcpServer.serverId,
        tool.name,
        async input => {
          const content = await tool.handler(
            input.args,
            callerFromInput(input)
          );
          return {
            content,
            metadata: {
              serverId: enginesMcpServer.serverId,
              toolName: tool.name,
              external: false,
            },
          };
        }
      );
    }
  }

  /**
   * Bind the mem0 deep-insight tools (`mem0.recall` / `mem0.relations` /
   * `mem0.stats`) directly on the host over the mem0 adapter seam. Mirrors
   * `bindEnginesMcpTools`: `registerServer` + one gated delegating
   * `registerInProcTool` per tool (the host runs each ONLY after
   * `authorize → risk`, then audits). The subject is BOUND to the host-authorized
   * caller (`callerFromInput`), never to the spoofable `args.userId`. Degrade-safe:
   * an absent mem0 adapter yields a truthful `fail(...)` from `deps.invoke`.
   */
  private bindMem0MemoryMcpTools(): void {
    const adapter = this.adapters.get('mem0');
    const tools = buildMem0MemoryMcpTools({
      invoke: (op, input) =>
        adapter
          ? adapter.invoke({ op, input })
          : Promise.resolve(fail('mem0 adapter not bound', 'unavailable')),
    });
    this.hostBundle.registerServer(mem0MemoryMcpServer);
    for (const tool of tools) {
      this.hostBundle.registerInProcTool(
        mem0MemoryMcpServer.serverId,
        tool.name,
        async input => {
          const content = await tool.handler(
            input.args,
            callerFromInput(input)
          );
          return {
            content,
            metadata: {
              serverId: mem0MemoryMcpServer.serverId,
              toolName: tool.name,
              external: false,
            },
          };
        }
      );
    }
  }

  /**
   * Bind the DEEP recodergit code-intelligence tools (`recodergit.symbol_search` /
   * `recodergit.find_references` / `recodergit.call_graph` / `recodergit.definition`)
   * directly on the host over the recodergit CLI adapter seam. Same gated
   * delegating shape as `bindMem0MemoryMcpTools`: `registerServer` + one gated
   * `registerInProcTool` per tool (the host runs each ONLY after `authorize → risk`,
   * then audits). These are READ-ONLY queries over a SHARED per-repo code graph
   * (no per-tenant subject), but the host-authorized caller is threaded via
   * `callerFromInput` and the tools REFUSE an anonymous call — the cross-tenant
   * class stays CLOSED. Truthful skip when the recodergit adapter is absent;
   * degrade-safe `{ available:false, reason }` when the repo is not indexed or the
   * in-process engine lib is absent (the adapter/service return a typed result,
   * never throw across the seam).
   */
  private bindRecodergitIntelMcpTools(): void {
    const adapter = this.adapters.get('recodergit');
    if (!adapter) return; // truthful skip when the recodergit adapter is absent
    const tools = buildRecodergitIntelMcpTools({
      invoke: (op: RecodergitIntelOp, input) => adapter.invoke({ op, input }),
    });
    this.hostBundle.registerServer(recodergitIntelMcpServer);
    for (const tool of tools) {
      this.hostBundle.registerInProcTool(
        recodergitIntelMcpServer.serverId,
        tool.name,
        async input => ({
          content: await tool.handler(input.args, callerFromInput(input)),
          metadata: {
            serverId: recodergitIntelMcpServer.serverId,
            toolName: tool.name,
            external: false,
          },
        })
      );
    }
  }

  /**
   * Bind the DEEP tmux introspection tools (`tmux.list_sessions` /
   * `tmux.list_windows` / `tmux.list_panes` / `tmux.capture_pane` /
   * `tmux.server_info`) directly on the host over the tmux adapter's read-only
   * {@link TmuxIntrospectPort}. Same gated delegating shape as
   * `bindMem0MemoryMcpTools`: `registerServer` + one gated `registerInProcTool` per
   * tool (the host runs each ONLY after `authorize → risk`, then audits). The
   * host-authorized caller is threaded via `callerFromInput`; the tools require an
   * admin/internal principal (the shared multiplexer has no per-tenant partition —
   * the cross-tenant class stays CLOSED). Truthful skip when the tmux adapter is
   * absent; degrade-safe `{ available:false, reason }` when the tmux binary is
   * missing (the port's methods return a typed `fail`, never throw).
   */
  private bindTmuxIntrospectMcpTools(): void {
    const tmux = this.adapters.get('tmux') as TmuxAdapter | undefined;
    if (!tmux) return; // truthful skip when the tmux adapter is absent
    this.hostBundle.registerServer(tmuxIntrospectMcpServer);
    for (const tool of buildTmuxIntrospectMcpTools({
      port: tmux.introspect(),
    })) {
      this.hostBundle.registerInProcTool(
        tmuxIntrospectMcpServer.serverId,
        tool.name,
        async input => ({
          content: await tool.handler(input.args, callerFromInput(input)),
          metadata: {
            serverId: tmuxIntrospectMcpServer.serverId,
            toolName: tool.name,
            external: false,
          },
        })
      );
    }
  }

  /**
   * Bind the DEEPER beads issue-graph query tools (`beads.blocked` / `beads.graph`
   * / `beads.deps` / `beads.search` / `beads.stats`) directly on the host over the
   * beads CLI adapter seam. Same gated delegating shape as `bindEnginesMcpTools`.
   * These are READ-ONLY over the SHARED repo issue graph — no per-tenant subject —
   * so they add no cross-tenant surface (the closed class stays closed). Truthful
   * skip when the beads adapter is absent; degrade-safe `{ error }` when `bd` is
   * not installed (the adapter's `invoke` returns a typed `fail`, never throws).
   */
  private bindBeadsGraphMcpTools(): void {
    const beads = this.adapters.get('beads');
    if (!beads) return; // truthful skip when the beads adapter is absent
    this.hostBundle.registerServer(beadsGraphMcpServer);
    for (const tool of buildBeadsGraphMcpTools(beads)) {
      this.hostBundle.registerInProcTool(
        beadsGraphMcpServer.serverId,
        tool.name,
        async input => ({
          content: await tool.handler(input.args, callerFromInput(input)),
          metadata: {
            serverId: beadsGraphMcpServer.serverId,
            toolName: tool.name,
            external: false,
          },
        })
      );
    }
  }

  /**
   * Bind the ops-recorder signals tools (`ops-recorder.query` /
   * `ops-recorder.stats`) directly on the host over the ops-recorder adapter seam.
   * Same gated delegating shape as `bindEnginesMcpTools`. Truthful skip when the
   * ops-recorder adapter is absent (never a faked registration).
   */
  private bindOpsRecorderSignalsMcpTools(): void {
    const engine = this.adapters.get('ops-recorder');
    if (!engine) return; // truthful skip when the ops-recorder adapter is absent
    this.hostBundle.registerServer(opsRecorderSignalsMcpServer);
    for (const tool of buildOpsRecorderSignalsMcpTools(engine)) {
      this.hostBundle.registerInProcTool(
        opsRecorderSignalsMcpServer.serverId,
        tool.name,
        async input => ({
          content: await tool.handler(input.args, callerFromInput(input)),
          metadata: {
            serverId: opsRecorderSignalsMcpServer.serverId,
            toolName: tool.name,
            external: false,
          },
        })
      );
    }
  }

  /**
   * Fire `adapter.start()` for every supervised (daemon/sidecar) engine in
   * parallel WITHOUT awaiting — each `start()` is idempotent + degrade-safe (an
   * absent binary/venv resolves to a no-op `down`, never throws, never blocks
   * past `waitMs`). Under the test runner the supervisors short-circuit before
   * any real spawn, so this is inert in tests.
   */
  private spawnSupervisedOnBoot(): void {
    const supervised = [...this.adapters.values()].filter(
      adapter =>
        adapter.transport === 'daemon' || adapter.transport === 'sidecar'
    );
    void Promise.allSettled(
      supervised.map(async adapter => {
        try {
          await adapter.start();
        } catch (err) {
          this.log.warn(
            {
              engineId: adapter.id,
              err: err instanceof Error ? err.message : String(err),
            },
            'engine spawn-on-boot degraded (truthful down)'
          );
        }
      })
    ).then(() => {
      this.log.info(
        { attempted: supervised.map(adapter => adapter.id) },
        'engines: supervised spawn-on-boot dispatched (health surfaces as each comes up)'
      );
    });
  }

  /** Shutdown: stop supervised daemons/sidecars. Idempotent, degrade-safe. */
  async stop(): Promise<void> {
    await Promise.all(
      [...this.adapters.values()].map(async adapter => {
        try {
          await adapter.stop();
        } catch {
          /* idempotent, degrade-safe */
        }
      })
    );
  }
}

/** Re-export so `isEngineId` is available to callers narrowing raw ids. */
export { isEngineId };
